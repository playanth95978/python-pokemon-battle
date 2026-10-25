"""Moteur synchrone sans dépendance à une infrastructure."""

from dataclasses import dataclass
from fractions import Fraction
from typing import Protocol

from .damage import damage_for_roll
from .types import Type, effectiveness
from .domain import Attack, AttackAction, BattleAction, Fighter, UsePotionAction


class RandomSource(Protocol):
    def randint(self, a: int, b: int) -> int: ...


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
    winner: str


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
    def winner(self) -> str | None:
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
            first_move = AttackAction(slot=first_move)

        if type(second_move) is int:
            second_move = AttackAction(slot=second_move)

        # Les appels actuels passent des entiers : les convertir en AttackAction pour garder leur compatibilité.
        if battle.winner is not None:
            raise ValueError("Battle has already ended")
        actions = [(battle.first, battle.second, first_move), (battle.second, battle.first, second_move)]
        # Valider les deux choix avant toute mutation ou consommation d'aléatoire.
        self._validate_actions(actions)
        actions = self._ordered_actions(actions)
        battle.turn += 1
        events: list[DomainEvent] = []
        for actor, target, move in actions:
            if isinstance(action, UsePotionAction):
                events.extend(self._execute_potion(battle.turn, actor))
            elif isinstance(action, AttackAction):
                events.extend(
                    self._execute_attack(battle.turn, actor, target, action.slot)
                )

            # Sinon, appeler _execute_attack avec le slot de AttackAction.
            # Une potion remplace l'attaque : exécuter une seule de ces deux branches.
            events.extend(self._execute_attack(battle.turn, actor, target, move))
            if battle.winner is not None:
                events.append(BattleEnded(battle.turn, actor.id))
                break
        return tuple(events)

    def _validate_actions(self, actions: list[tuple[Fighter, Fighter, BattleAction]]) -> None:
        """Valider tous les choix avant de modifier l'état ou de consommer du hasard."""
        for actor, _, action in actions:
            if isinstance(action, AttackAction):
                self._validate_attack(actor, action.slot)
            elif isinstance(action, UsePotionAction):
                self._validate_potion(actor)
            else:
                raise ValueError("Invalid battle action")

    def _validate_attack(self, actor: Fighter, slot: int) -> None:
        if type(slot) is not int or not 0 <= slot < len(actor.pp):
            raise ValueError("Invalid attack slot")
        if actor.pp[slot] <= 0:
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
        first_speed = actions[0][0].species.stats.speed
        second_speed = actions[1][0].species.stats.speed
        if second_speed > first_speed or (second_speed == first_speed and self.rng.randint(0, 1) == 1):
            return list(reversed(actions))

        return actions

    def _execute_attack(
            self, turn: int, actor: Fighter, target: Fighter, move: int,
    ) -> tuple[DomainEvent, ...]:
        attack = actor.species.attacks[move]
        actor.pp[move] -= 1
        events: list[DomainEvent] = [
            AttackUsed(turn, actor.id, target.id, attack.name, actor.pp[move], attack.type, move),
        ]
        if self.rng.randint(1, 100) > attack.accuracy:
            events.append(AttackMissed(turn, actor.id, target.id))
            return tuple(events)
        multiplier = effectiveness(attack.type, target.species.types)
        damage = min(target.hp, self._damage(actor, target, attack, multiplier))
        target.hp -= damage
        events.append(DamageDealt(turn, actor.id, target.id, damage, target.hp, multiplier))
        if target.knocked_out:
            events.append(KnockedOut(turn, target.id))
        return tuple(events)

    def _execute_potion(self, turn: int, actor: Fighter) -> tuple[PotionUsed, ...]:
        """Soigner le combattant et décrire le résultat sans consommer de PP ni de hasard."""
        # 1. Calculer les PV manquants à partir du maximum de l'espèce et des PV actuels.
        self._validate_potion(actor)
        missing_hp: int = actor.species.stats.hp - actor.hp
        # 2. Limiter le soin à 20 PV ou aux PV manquants pour ne pas dépasser le maximum.
        healed: int = min(20, missing_hp)
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
        return damage_for_roll(actor.level, actor.species.stats, target.species.stats, attack,
                               actor.species.types, multiplier, self.rng.randint(85, 100))
