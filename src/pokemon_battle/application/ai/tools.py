"""Outils autorisés : observation et sélection, jamais résolution du combat."""

from dataclasses import asdict
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from pokemon_battle.types import effectiveness
from .generation import ToolCall
from .tools_context import AttackDecision, ToolsContext


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SelectAttackRequest(EmptyRequest):
    slot: int = Field(ge=0, le=3, strict=True)
    comment: str = Field(default="", max_length=160, strict=True)


_DEFINITIONS = {
    "inspect_battle": ("Observer le tour, les PV et les types visibles des deux combattants.", EmptyRequest),
    "list_legal_moves": ("Lister ses attaques jouables avec leurs slots, PP, types, puissance et précision.", EmptyRequest),
    "evaluate_matchups": ("Consulter les multiplicateurs de types des attaques jouables ; ce ne sont pas des dégâts calculés.", EmptyRequest),
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
        result = {"matchups": [{"slot": move.slot, "type": move.type.value,
                                "multiplier": float(effectiveness(move.type, context.view.opponent.types))}
                               for move in context.legal_moves]}
    else:
        assert isinstance(request, SelectAttackRequest)
        if not any(move.slot == request.slot for move in context.legal_moves):
            return {"error": "illegal_move", "message": "Choisir un slot retourné par list_legal_moves."}
        context.decision = AttackDecision(request.slot, "llm", request.comment)
        result = {"selected_slot": request.slot}
    context.observations[call.name] = result
    return result
