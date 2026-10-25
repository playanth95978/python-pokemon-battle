"""Estimation exacte des tirages possibles d'une attaque isolée sur l'instantané."""

from fractions import Fraction
from typing import Any

from pokemon_battle.damage import damage_for_roll
from pokemon_battle.domain import Attack
from pokemon_battle.types import effectiveness
from .tools_context import FighterView, MoveView, ToolsContext


def damage_rolls(attacker: FighterView, defender: FighterView, move: MoveView, target_hp: int) -> list[int]:
    """Dégâts réels des 16 tirages si l'attaque touche, bornés aux PV de la cible."""
    attack = Attack(move.name, move.type, move.power, move.accuracy, move.max_pp, move.category)
    multiplier = effectiveness(move.type, defender.types)
    # Énumérer les 16 tirages conserve les arrondis du moteur, sans toucher à son RNG.
    return [min(target_hp, damage_for_roll(attacker.level, attacker.stats, defender.stats, attack,
                                           attacker.types, multiplier, roll)) for roll in range(85, 101)]


def ko_probability(damages: list[int], target_hp: int, accuracy: int) -> Fraction:
    return Fraction(sum(damage >= target_hp for damage in damages), len(damages)) * Fraction(accuracy, 100)


def estimate_move(context: ToolsContext, move: MoveView) -> dict[str, Any]:
    actor, target = context.view.fighter, context.view.opponent
    multiplier = effectiveness(move.type, target.types)
    damages = damage_rolls(actor, target, move, target.hp)
    hit_probability = Fraction(move.accuracy, 100)
    mean_on_hit = Fraction(sum(damages), len(damages))
    return {
        "attack_slot": move.attack_slot, "name": move.name, "category": move.category.value,
        "type_multiplier": float(multiplier), "stab_multiplier": 1.5 if move.type in actor.types else 1.0,
        "hit_probability": float(hit_probability),
        "min_damage_on_hit": min(damages), "max_damage_on_hit": max(damages),
        "mean_damage_on_hit": float(mean_on_hit),
        "expected_damage": float(mean_on_hit * hit_probability),
        "ko_probability": float(ko_probability(damages, target.hp, move.accuracy)),
    }
