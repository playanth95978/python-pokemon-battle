"""Estimation exacte des tirages possibles d'une attaque isolée sur l'instantané."""

from fractions import Fraction
from typing import Any

from pokemon_battle.damage import damage_for_roll
from pokemon_battle.domain import Attack
from pokemon_battle.types import effectiveness
from .tools_context import MoveView, ToolsContext




def estimate_healing(context: ToolsContext) -> dict[str, object]:
    actor = context.view.fighter

    if actor.hp <= 0:
        return {"available": False, "reason": "Le combattant est KO"}

    if actor.potions <= 0:
        return {"available": False, "reason": "Le stock de potions est vide"}

    if actor.hp >= actor.max_hp:
        return {"available": False, "reason": "Les PV sont déjà pleins"}

    healed = min(20, actor.max_hp - actor.hp)

    return {
        "available": True,
        "healed": healed,
        "hp_after_healing": actor.hp + healed,
        "potions_remaining_after_use": actor.potions - 1,
    }