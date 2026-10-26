"""Moteur synchrone sans dépendance à une infrastructure."""

from dataclasses import dataclass, replace
from enum import StrEnum
from fractions import Fraction
from typing import Protocol

from .damage import damage_for_roll
from .types import Type, effectiveness
from .domain import (
    MAX_STAT_STAGE, ApplyStatus, Attack, AttackAction, AttackEffect, BattleAction, BattleStat,
    Category, Fighter, ModifyStat, Protect, StatusCondition, Target, UsePotionAction,
    potion_healing,
)


FULL_PARALYSIS_CHANCE = 25
BURN_DAMAGE_DIVISOR = 16
STATUS_IMMUNITIES = {StatusCondition.PARALYSIS: Type.ELECTRIC, StatusCondition.BURN: Type.FIRE}


class RandomSource(Protocol):
    def randint(self, a: int, b: int) -> int: ...


class FailureReason(StrEnum):
    ALREADY_HAS_STATUS = "already_has_status"
    IMMUNE = "immune"
    STAT_LIMIT = "stat_limit"
    CONSECUTIVE_PROTECTION = "consecutive_protection"


# =========================
# Base events
# =========================

@dataclass(frozen=True, slots=True)
class BattleEvent:
    turn: int


@dataclass(frozen=True, slots=True)
class ActorEvent(BattleEvent):
    actor: str


@dataclass(frozen=True, slots=True)
class TargetedAction(ActorEvent):
    target: str


# =========================
# Domain events
# =========================

@dataclass(frozen=True, slots=True)
class PotionUsed(ActorEvent):
    healed: int
    hp_remaining: int
    potions_remaining: int


@dataclass(frozen=True, slots=True)
class AttackUsed(TargetedAction):
    attack: str
    pp_remaining: int

    # Compatibilité avec les anciens événements sérialisés.
    attack_type: Type | None = None
    attack_slot: int | None = None


@dataclass(frozen=True, slots=True)
class AttackMissed(TargetedAction):
    pass


@dataclass(frozen=True, slots=True)
class DamageDealt(TargetedAction):
    damage: int
    hp_remaining: int
    effectiveness: Fraction


@dataclass(frozen=True, slots=True)
class KnockedOut(BattleEvent):
    fighter: str


@dataclass(frozen=True, slots=True)
class BattleEnded(BattleEvent):
    # None : double KO, le combat se termine sur un match nul.
    winner: str | None


@dataclass(frozen=True, slots=True)
class FullyParalyzed(ActorEvent):
    pass


@dataclass(frozen=True, slots=True)
class AttackBlocked(TargetedAction):
    pass


@dataclass(frozen=True, slots=True)
class StatusApplied(TargetedAction):
    condition: StatusCondition


@dataclass(frozen=True, slots=True)
class StatChanged(TargetedAction):
    stat: BattleStat
    change: int
    stage: int


@dataclass(frozen=True, slots=True)
class ProtectionActivated(ActorEvent):
    pass


@dataclass(frozen=True, slots=True)
class EffectFailed(TargetedAction):
    reason: FailureReason


@dataclass(frozen=True, slots=True)
class BurnDamage(BattleEvent):
    fighter: str
    damage: int
    hp_remaining: int


# =========================
# Domain event types
# =========================

type DomainEvent = (
        PotionUsed
        | AttackUsed
        | AttackMissed
        | DamageDealt
        | KnockedOut
        | BattleEnded
        | FullyParalyzed
        | AttackBlocked
        | StatusApplied
        | StatChanged
        | ProtectionActivated
        | EffectFailed
        | BurnDamage
)


# =========================
# Battle aggregate
# =========================

@dataclass(slots=True)
class Battle:
    first: Fighter
    second: Fighter
    turn: int = 0

    def __post_init__(self) -> None:
        if self.first.id == self.second.id:
            raise ValueError("Fighter ids must differ")
        if self.first.knocked_out or self.second.knocked_out:
            raise ValueError("Both fighters must be conscious")

    @property
    def is_over(self) -> bool:
        return self.first.knocked_out or self.second.knocked_out

    @property
    def winner(self) -> str | None:
        """Vainqueur, ou None si le combat continue ou s'est terminé sur un double KO."""
        if self.first.knocked_out and self.second.knocked_out:
            return None
        if self.first.knocked_out:
            return self.second.id
        if self.second.knocked_out:
            return self.first.id
        return None


class BattleEngine:
    def __init__(self, rng: RandomSource):
        self.rng = rng

    def play_turn(self, battle: Battle, first_move: int | BattleAction, second_move: int | BattleAction) -> tuple[
        DomainEvent, ...]:
        if type(first_move) is int:
            first_move = AttackAction(attack_slot=first_move)

        if type(second_move) is int:
            second_move = AttackAction(attack_slot=second_move)

        # Les appels actuels passent des entiers : les convertir en AttackAction pour garder leur compatibilité.
        if battle.is_over:
            raise ValueError("Battle has already ended")
        actions = [(battle.first, battle.second, first_move), (battle.second, battle.first, second_move)]
        # Valider les deux choix avant toute mutation ou consommation d'aléatoire.
        self._validate_actions(actions)
        actions = self._ordered_actions(actions)
        battle.turn += 1
        events: list[DomainEvent] = []
        for actor, target, action in actions:
            if isinstance(action, UsePotionAction):
                events.extend(self._execute_potion(battle.turn, actor))
            elif isinstance(action, AttackAction):
                events.extend(
                    self._execute_attack(battle.turn, actor, target, action.attack_slot)
                )
            if battle.is_over:
                break
        fighters = [actor for actor, _, _ in actions]
        if not battle.is_over:
            events.extend(self._apply_burns(battle.turn, fighters))
        self._end_protections(fighters)
        if battle.is_over:
            events.append(BattleEnded(battle.turn, battle.winner))
        return tuple(events)

    def _validate_actions(self, actions: list[tuple[Fighter, Fighter, BattleAction]]) -> None:
        """Valider tous les choix avant de modifier l'état ou de consommer du hasard."""
        for actor, _, action in actions:
            if isinstance(action, AttackAction):
                self._validate_attack(actor, action.attack_slot)
            elif isinstance(action, UsePotionAction):
                self._validate_potion(actor)
            else:
                raise ValueError("Invalid battle action")

    def _validate_attack(self, actor: Fighter, attack_slot: int) -> None:
        if type(attack_slot) is not int or not 0 <= attack_slot < len(actor.pp):
            raise ValueError("Invalid attack slot")
        if actor.pp[attack_slot] <= 0:
            raise ValueError("Attack has no PP remaining")

    def _validate_potion(self, actor: Fighter) -> None:
        if actor.species.stats.hp == actor.hp:
            raise ValueError("Impossible d'utiliser une potion, votre vie est pleine")
        if actor.potions <= 0:
            raise ValueError("Vous n'avez plus de potions en stock")
        if actor.knocked_out:
            raise ValueError("Le combattant est KO")

    def _ordered_actions(
            self,
            actions: list[tuple[Fighter, Fighter, BattleAction]],
    ) -> list[tuple[Fighter, Fighter, BattleAction]]:
        first_is_potion = isinstance(actions[0][2], UsePotionAction)
        second_is_potion = isinstance(actions[1][2], UsePotionAction)
        if first_is_potion:
            return actions
        if second_is_potion:
            return list(reversed(actions))
        first_initiative = self._initiative(actions[0][0], actions[0][2])
        second_initiative = self._initiative(actions[1][0], actions[1][2])
        if second_initiative > first_initiative or (
                second_initiative == first_initiative and self.rng.randint(0, 1) == 1):
            return list(reversed(actions))

        return actions

    def _initiative(self, actor: Fighter, action: AttackAction) -> tuple[int, int]:
        """La priorité de l'attaque passe avant la vitesse effective (crans et paralysie)."""
        return actor.species.attacks[action.attack_slot].priority, actor.effective_speed

    def _execute_attack(
            self, turn: int, actor: Fighter, target: Fighter, move: int,
    ) -> tuple[DomainEvent, ...]:
        attack = actor.species.attacks[move]
        # Le tirage de paralysie n'existe que pour un paralysé : les séquences existantes restent inchangées.
        if actor.status == StatusCondition.PARALYSIS and self.rng.randint(1, 100) <= FULL_PARALYSIS_CHANCE:
            return (FullyParalyzed(turn, actor.id),)
        actor.pp[move] -= 1
        receiver = actor if attack.target == Target.SELF else target
        events: list[DomainEvent] = [
            AttackUsed(turn, actor.id, receiver.id, attack.name, actor.pp[move], attack.type, move),
        ]
        if receiver is not actor and receiver.protected:
            events.append(AttackBlocked(turn, actor.id, receiver.id))
            return tuple(events)
        if attack.accuracy is not None and self.rng.randint(1, 100) > attack.accuracy:
            events.append(AttackMissed(turn, actor.id, receiver.id))
            return tuple(events)
        if attack.deals_damage:
            events.extend(self._deal_damage(turn, actor, receiver, attack))
        else:
            events.extend(self._apply_effect(turn, actor, receiver, effect) for effect in attack.effects)
        return tuple(events)

    def _deal_damage(self, turn: int, actor: Fighter, target: Fighter, attack: Attack) -> list[DomainEvent]:
        multiplier = effectiveness(attack.type, target.species.types)
        damage = min(target.hp, self._damage(actor, target, attack, multiplier))
        target.hp -= damage
        events: list[DomainEvent] = [DamageDealt(turn, actor.id, target.id, damage, target.hp, multiplier)]
        if target.knocked_out:
            events.append(KnockedOut(turn, target.id))
        return events

    def _apply_effect(self, turn: int, actor: Fighter, receiver: Fighter, effect: AttackEffect) -> DomainEvent:
        if isinstance(effect, ApplyStatus):
            return self._apply_status(turn, actor, receiver, effect.condition)
        if isinstance(effect, ModifyStat):
            return self._modify_stat(turn, actor, receiver, effect)
        if isinstance(effect, Protect):
            return self._protect(turn, actor)
        raise ValueError("Unknown attack effect")

    def _apply_status(
            self, turn: int, actor: Fighter, receiver: Fighter, condition: StatusCondition,
    ) -> DomainEvent:
        if receiver.status is not None:
            return EffectFailed(turn, actor.id, receiver.id, FailureReason.ALREADY_HAS_STATUS)
        if STATUS_IMMUNITIES[condition] in receiver.species.types:
            return EffectFailed(turn, actor.id, receiver.id, FailureReason.IMMUNE)
        receiver.status = condition
        return StatusApplied(turn, actor.id, receiver.id, condition)

    def _modify_stat(self, turn: int, actor: Fighter, receiver: Fighter, effect: ModifyStat) -> DomainEvent:
        current = receiver.stat_stages.of(effect.stat)
        stage = max(-MAX_STAT_STAGE, min(MAX_STAT_STAGE, current + effect.stages))
        if stage == current:
            return EffectFailed(turn, actor.id, receiver.id, FailureReason.STAT_LIMIT)
        receiver.stat_stages = replace(receiver.stat_stages, **{effect.stat.value: stage})
        return StatChanged(turn, actor.id, receiver.id, effect.stat, stage - current, stage)

    def _protect(self, turn: int, actor: Fighter) -> DomainEvent:
        if actor.protected_last_turn:
            return EffectFailed(turn, actor.id, actor.id, FailureReason.CONSECUTIVE_PROTECTION)
        actor.protected = True
        return ProtectionActivated(turn, actor.id)

    def _apply_burns(self, turn: int, fighters: list[Fighter]) -> list[DomainEvent]:
        """Brûlure de fin de tour dans l'ordre d'action ; les deux combattants peuvent tomber KO."""
        events: list[DomainEvent] = []
        for fighter in fighters:
            if fighter.status != StatusCondition.BURN:
                continue
            damage = min(fighter.hp, max(1, fighter.species.stats.hp // BURN_DAMAGE_DIVISOR))
            fighter.hp -= damage
            events.append(BurnDamage(turn, fighter.id, damage, fighter.hp))
            if fighter.knocked_out:
                events.append(KnockedOut(turn, fighter.id))
        return events

    def _end_protections(self, fighters: list[Fighter]) -> None:
        for fighter in fighters:
            fighter.protected_last_turn = fighter.protected
            fighter.protected = False

    def _execute_potion(self, turn: int, actor: Fighter) -> tuple[PotionUsed, ...]:
        """Soigner le combattant et décrire le résultat sans consommer de PP ni de hasard."""
        # 1-2. Règle partagée avec l'estimation : 20 PV au plus, sans dépasser le maximum.
        self._validate_potion(actor)
        healed: int = potion_healing(actor.hp, actor.species.stats.hp)
        # 3. Ajouter le soin réel aux PV du combattant.
        actor.hp += healed
        # 4. Décrémenter le stock d'une potion.
        actor.potions -= 1
        # 5. Construire PotionUsed avec le tour, l'acteur, le soin réel, les PV et le stock restants.
        potion_used = PotionUsed(turn, actor.id, healed, actor.hp, actor.potions)
        # 6. Retourner cet événement dans un tuple contenant un seul élément.
        events: list[DomainEvent] = []
        events.append(potion_used)
        return tuple(events)

    def _damage(self, actor: Fighter, target: Fighter, attack: Attack, multiplier: Fraction) -> int:
        if multiplier == 0:
            return 0
        physical = attack.category == Category.PHYSICAL
        return damage_for_roll(
            actor.level, actor.species.stats, target.species.stats, attack,
            actor.species.types, multiplier, self.rng.randint(85, 100),
            attack_stage=actor.stat_stages.of(BattleStat.ATTACK if physical else BattleStat.SPECIAL_ATTACK),
            defense_stage=target.stat_stages.of(BattleStat.DEFENSE if physical else BattleStat.SPECIAL_DEFENSE),
            burned=actor.status == StatusCondition.BURN,
        )
