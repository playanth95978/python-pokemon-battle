"""Formule pure partagée par le moteur et les estimations, sans tirage aléatoire."""

from fractions import Fraction

from .domain import Attack, Category, Stats
from .types import Type


def damage_for_roll(level: int, offense: Stats, defense: Stats, attack: Attack,
                    actor_types: tuple[Type, ...], multiplier: Fraction, roll: int) -> int:
    if type(roll) is not int or not 85 <= roll <= 100:
        raise ValueError("Damage roll must be an integer between 85 and 100")
    if multiplier == 0:
        return 0
    atk = offense.attack if attack.category == Category.PHYSICAL else offense.special_attack
    dfn = defense.defense if attack.category == Category.PHYSICAL else defense.special_defense
    base = ((2 * level // 5 + 2) * attack.power * atk // dfn) // 50 + 2
    stab = Fraction(3, 2) if attack.type in actor_types else Fraction(1)
    return max(1, int(base * stab * multiplier * Fraction(roll, 100)))
