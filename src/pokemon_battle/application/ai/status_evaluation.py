"""Issue prévisible des attaques de statut jouables, avec les contrôles du moteur et sans tirage."""

from typing import Any

from pokemon_battle.domain import ApplyStatus, AttackEffect, ModifyStat, Protect, Target
from pokemon_battle.engine import FailureReason, stage_after, status_failure
from pokemon_battle.application.effect_serialization import serialize_effect
from .tools_context import FighterView, MoveView, ToolsContext

STATUS_RULES = (
    "Une attaque de statut ne fait aucun dégât. Paralysie : vitesse divisée par 2 et 25 % de tours perdus. "
    "Brûlure : 1/16 des PV max perdus à chaque fin de tour et dégâts physiques divisés par 2. "
    "Un statut est permanent et un combattant n'en porte qu'un. Crans de -6 à +6 : multiplicateur "
    "(2+n)/2 en hausse, 2/(2-n) en baisse. Protection : bloque ce tour les attaques adverses qui la suivent ; "
    "échoue si elle a réussi au tour précédent."
)


def evaluate_status_moves(context: ToolsContext) -> list[dict[str, Any]]:
    return [_evaluate(context, move) for move in context.legal_moves if not move.deals_damage]


def _evaluate(context: ToolsContext, move: MoveView) -> dict[str, Any]:
    actor = context.view.fighter
    receiver = actor if move.target == Target.SELF else context.view.opponent
    effects = [_outcome(effect, actor, receiver) for effect in move.effects]
    return {"attack_slot": move.attack_slot, "name": move.name, "target": move.target.value,
            "priority": move.priority, "hit_probability": move.hit_chance / 100,
            "would_have_effect": any(effect["applies"] for effect in effects), "effects": effects}


def _outcome(effect: AttackEffect, actor: FighterView, receiver: FighterView) -> dict[str, Any]:
    data = serialize_effect(effect)
    if isinstance(effect, ApplyStatus):
        reason = status_failure(effect.condition, receiver.status, receiver.types)
        return {**data, "applies": reason is None, "reason": reason}
    if isinstance(effect, ModifyStat):
        current = receiver.stat_stages.of(effect.stat)
        after = stage_after(current, effect.stages)
        return {**data, "applies": after != current,
                "reason": None if after != current else FailureReason.STAT_LIMIT, "stage_after": after}
    if isinstance(effect, Protect):
        failed = actor.protected_last_turn
        return {**data, "applies": not failed, "reason": FailureReason.CONSECUTIVE_PROTECTION if failed else None}
    raise ValueError("Effet d'attaque inconnu")
