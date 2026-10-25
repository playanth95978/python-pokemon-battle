"""Estimation d'une potion sur l'instantané, sans consommer de stock ni jouer le tour."""

from pokemon_battle.domain import potion_healing, potion_unavailable_reason
from .tools_context import ToolsContext


def estimate_healing(context: ToolsContext) -> dict[str, object]:
    actor = context.view.fighter
    unavailable = potion_unavailable_reason(actor.hp, actor.max_hp, actor.potions)
    if unavailable is not None:
        return {"available": False, "reason": unavailable}
    healed = potion_healing(actor.hp, actor.max_hp)
    return {
        "available": True,
        "healed": healed,
        "hp_after_healing": actor.hp + healed,
        "potions_remaining_after_use": actor.potions - 1,
    }

