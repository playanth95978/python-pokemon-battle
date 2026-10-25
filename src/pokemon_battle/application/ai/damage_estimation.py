"""Estimation exacte des tirages possibles d'une attaque isolée sur l'instantané."""

from fractions import Fraction
from typing import Any

from pokemon_battle.damage import damage_for_roll
from pokemon_battle.domain import Attack
from pokemon_battle.types import effectiveness
from .tools_context import MoveView, ToolsContext


def estimate_move(context: ToolsContext, move: MoveView) -> dict[str, Any]:
    actor, target = context.view.fighter, context.view.opponent
    attack = Attack(move.name, move.type, move.power, move.accuracy, move.max_pp, move.category)
    multiplier = effectiveness(move.type, target.types)
    # Énumérer les 16 tirages conserve les arrondis du moteur, sans toucher à son RNG.
    damages = [min(target.hp, damage_for_roll(actor.level, actor.stats, target.stats, attack,
                                             actor.types, multiplier, roll)) for roll in range(85, 101)]
    hit_probability = Fraction(move.accuracy, 100)
    mean_on_hit = Fraction(sum(damages), len(damages))
    return {
        "slot": move.slot, "name": move.name, "category": move.category.value,
        "type_multiplier": float(multiplier), "stab_multiplier": 1.5 if move.type in actor.types else 1.0,
        "hit_probability": float(hit_probability),
        "min_damage_on_hit": min(damages), "max_damage_on_hit": max(damages),
        "mean_damage_on_hit": float(mean_on_hit),
        "expected_damage": float(mean_on_hit * hit_probability),
        "ko_probability": float(Fraction(sum(damage >= target.hp for damage in damages), len(damages)) * hit_probability),
    }
