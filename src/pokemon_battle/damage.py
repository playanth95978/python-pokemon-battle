"""Formule pure partagée par le moteur et les estimations, sans tirage aléatoire."""

from fractions import Fraction

from .domain import Attack, Category, Stats, staged_value
from .types import Type


def damage_for_roll(level: int, offense: Stats, defense: Stats, attack: Attack,
                    actor_types: tuple[Type, ...], multiplier: Fraction, roll: int, *,
                    attack_stage: int = 0, defense_stage: int = 0, burned: bool = False) -> int:
    """Dégâts d'un tirage ; les crans sont ceux de la catégorie de l'attaque (voir docs/battle-rules.md)."""
    if type(roll) is not int or not 85 <= roll <= 100:
        raise ValueError("Damage roll must be an integer between 85 and 100")
    if attack.power is None:
        raise ValueError("A status attack deals no damage")
    if multiplier == 0:
        return 0
    physical = attack.category == Category.PHYSICAL
    atk = staged_value(offense.attack if physical else offense.special_attack, attack_stage)
    dfn = staged_value(defense.defense if physical else defense.special_defense, defense_stage)
    base = ((2 * level // 5 + 2) * attack.power * atk // dfn) // 50 + 2
    stab = Fraction(3, 2) if attack.type in actor_types else Fraction(1)
    burn = Fraction(1, 2) if burned and physical else Fraction(1)
    return max(1, int(base * stab * multiplier * Fraction(roll, 100) * burn))
