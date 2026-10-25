"""Estimation d'une potion sur l'instantané, sans consommer de stock ni jouer le tour."""

from pokemon_battle.domain import potion_healing
from .tools_context import ToolsContext


def estimate_healing(context: ToolsContext) -> dict[str, object]:
    actor = context.view.fighter
    unavailable = _unavailable_reason(actor.hp, actor.max_hp, actor.potions)
    if unavailable is not None:
        return {"available": False, "reason": unavailable}
    healed = potion_healing(actor.hp, actor.max_hp)
    return {
        "available": True,
        "healed": healed,
        "hp_after_healing": actor.hp + healed,
        "potions_remaining_after_use": actor.potions - 1,
    }


def _unavailable_reason(hp: int, max_hp: int, potions: int) -> str | None:
    # Même ordre de contrôle que le moteur, pour annoncer la raison qu'il opposerait.
    if hp <= 0:
        return "Le combattant est KO"
    if hp >= max_hp:
        return "Les PV sont déjà pleins"
    if potions <= 0:
        return "Le stock de potions est vide"
    return None
