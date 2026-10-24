"""Moteur synchrone sans dépendance à une infrastructure."""

from dataclasses import dataclass
from fractions import Fraction
from typing import Protocol

from .domain import Attack, Category, Fighter
from .types import Type, effectiveness


class RandomSource(Protocol):
    def randint(self, a: int, b: int) -> int: ...


@dataclass(frozen=True, slots=True)
class AttackUsed:
    turn: int
    actor: str
    target: str
    attack: str
    pp_remaining: int
    # Facultatifs pour relire les reçus enregistrés avant l'enrichissement des événements.
    attack_type: Type | None = None
    attack_slot: int | None = None


@dataclass(frozen=True, slots=True)
class AttackMissed:
    turn: int
    actor: str
    target: str


@dataclass(frozen=True, slots=True)
class DamageDealt:
    turn: int
    actor: str
    target: str
    damage: int
    hp_remaining: int
    effectiveness: Fraction


@dataclass(frozen=True, slots=True)
class KnockedOut:
    turn: int
    fighter: str


@dataclass(frozen=True, slots=True)
class BattleEnded:
    turn: int
    winner: str


type DomainEvent = AttackUsed | AttackMissed | DamageDealt | KnockedOut | BattleEnded


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

    def play_turn(self, battle: Battle, first_move: int, second_move: int) -> tuple[DomainEvent, ...]:
        if battle.winner is not None:
            raise ValueError("Battle has already ended")
        actions = [(battle.first, battle.second, first_move), (battle.second, battle.first, second_move)]
        # Valider les deux choix avant toute mutation ou consommation d'aléatoire.
        self._validate_moves(actions)
        actions = self._ordered_actions(actions)
        battle.turn += 1
        events: list[DomainEvent] = []
        for actor, target, move in actions:
            events.extend(self._execute_attack(battle.turn, actor, target, move))
            if battle.winner is not None:
                events.append(BattleEnded(battle.turn, actor.id))
                break
        return tuple(events)

    def _validate_moves(self, actions: list[tuple[Fighter, Fighter, int]]) -> None:
        for actor, _, index in actions:
            if type(index) is not int or not 0 <= index < len(actor.pp):
                raise ValueError("Invalid attack slot")
            if actor.pp[index] <= 0:
                raise ValueError("Attack has no PP remaining")

    def _ordered_actions(
        self, actions: list[tuple[Fighter, Fighter, int]],
    ) -> list[tuple[Fighter, Fighter, int]]:
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

    def _damage(self, actor: Fighter, target: Fighter, attack: Attack, multiplier: Fraction) -> int:
        if multiplier == 0:
            return 0
        offense = actor.species.stats
        defense = target.species.stats
        atk = offense.attack if attack.category == Category.PHYSICAL else offense.special_attack
        dfn = defense.defense if attack.category == Category.PHYSICAL else defense.special_defense
        base = ((2 * actor.level // 5 + 2) * attack.power * atk // dfn) // 50 + 2
        stab = Fraction(3, 2) if attack.type in actor.species.types else Fraction(1)
        return max(1, int(base * stab * multiplier * Fraction(self.rng.randint(85, 100), 100)))
