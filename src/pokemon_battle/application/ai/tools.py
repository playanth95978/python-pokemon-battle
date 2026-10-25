"""Outils autorisés : observation et sélection, jamais résolution du combat."""

from dataclasses import asdict
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from pokemon_battle.types import Type, effectiveness
from .generation import ToolCall
from .damage_estimation import estimate_move
from .tools_context import AttackDecision, MoveView, ToolsContext


def _matchup(move: MoveView, opponent_types: tuple[Type, ...]) -> dict[str, Any]:
    multiplier = effectiveness(move.type, opponent_types)
    label = "immune" if multiplier == 0 else "resisted" if multiplier < 1 else "neutral" if multiplier == 1 else "super_effective"
    explanations = {
        "immune": "Aucun dégât : la cible est immunisée contre ce type.",
        "resisted": "La cible résiste à ce type : dégâts réduits.",
        "neutral": "Efficacité normale pour ce type.",
        "super_effective": "Faiblesse de la cible à ce type : dégâts amplifiés.",
    }
    return {"slot": move.slot, "name": move.name, "type": move.type.value,
            "target_types": [kind.value for kind in opponent_types],
            "multiplier": float(multiplier), "effectiveness": label,
            "explanation": explanations[label]}


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SelectAttackRequest(EmptyRequest):
    slot: int = Field(ge=0, le=3, strict=True)
    comment: str = Field(default="", max_length=160, strict=True)


_DEFINITIONS = {
    "inspect_battle": ("Observer le tour, les PV et les types visibles des deux combattants.", EmptyRequest),
    "list_legal_moves": ("Lister ses attaques jouables avec leurs slots, PP, types, puissance et précision.", EmptyRequest),
    "evaluate_matchups": ("Consulter les multiplicateurs de types des attaques jouables ; ce ne sont pas des dégâts calculés.", EmptyRequest),
    "estimate_damage": ("Comparer les dégâts des attaques jouables : plage si l'attaque touche, moyenne avec précision, probabilité de KO. Calcul du moteur sur l'état actuel, sans jouer le tour.", EmptyRequest),
    "select_attack": ("Terminer la décision en sélectionnant un slot jouable, sans exécuter le tour.", SelectAttackRequest),
}


def tool_schemas() -> list[dict[str, Any]]:
    return [{"type": "function", "function": {"name": name, "description": description,
             "parameters": request.model_json_schema()}}
            for name, (description, request) in _DEFINITIONS.items()]


def execute_tool(context: ToolsContext, call: ToolCall) -> dict[str, Any]:
    if context.decision is not None:
        return {"error": "decision_already_selected"}
    definition = _DEFINITIONS.get(call.name)
    if definition is None:
        return {"error": "unknown_tool"}
    try:
        request = definition[1].model_validate_json(call.arguments)
    except ValidationError:
        return {"error": "invalid_arguments", "message": "Respecter le schéma JSON de l'outil."}
    if call.name == "inspect_battle":
        result = {"battle_id": str(context.battle_id), "turn": context.view.turn,
                  "fighter": asdict(context.view.fighter), "opponent": asdict(context.view.opponent)}
    elif call.name == "list_legal_moves":
        result = {"moves": [asdict(move) for move in context.legal_moves]}
    elif call.name == "evaluate_matchups":
        result = {"matchups": [_matchup(move, context.view.opponent.types) for move in context.legal_moves]}
    elif call.name == "estimate_damage":
        result = {"estimates": [estimate_move(context, move) for move in context.legal_moves],
                  "assumption": "Attaque isolée sur les PV actuels ; suppose que l'acteur peut agir. Ne prédit ni le choix adverse ni un combat complet."}
    else:
        assert isinstance(request, SelectAttackRequest)
        if not any(move.slot == request.slot for move in context.legal_moves):
            return {"error": "illegal_move", "message": "Choisir un slot retourné par list_legal_moves."}
        context.decision = AttackDecision(request.slot, "llm", request.comment)
        result = {"selected_slot": request.slot}
    context.observations[call.name] = result
    return result
