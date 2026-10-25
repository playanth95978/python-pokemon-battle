"""Outils autorisés : observation et sélection, jamais résolution du combat."""

from dataclasses import asdict
import hashlib
import json
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, ValidationError

from pokemon_battle.types import Type, effectiveness
from .generation import ToolCall
from .damage_estimation import estimate_move
from .healing_estimation import estimate_healing
from .incoming_damage_estimation import estimate_incoming_damage
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
    return {"attack_slot": move.attack_slot, "name": move.name, "type": move.type.value,
            "target_types": [kind.value for kind in opponent_types],
            "multiplier": float(multiplier), "effectiveness": label,
            "explanation": explanations[label]}


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SelectAttackRequest(EmptyRequest):
    attack_slot: int = Field(ge=0, le=3, strict=True, validation_alias=AliasChoices("attack_slot", "slot"))
    comment: str = Field(default="", max_length=160, strict=True)


class SelectPotionRequest(EmptyRequest):
    comment: str = Field(default="", max_length=160, strict=True)


_DEFINITIONS = {
    "inspect_battle": ("Observer le tour, les PV et les types visibles des deux combattants.", EmptyRequest),
    "list_legal_moves": ("Lister ses attaques jouables avec leurs slots, PP, types, puissance et précision.",
                         EmptyRequest),
    "evaluate_matchups": (
        "Consulter les multiplicateurs de types des attaques jouables ; ce ne sont pas des dégâts calculés.",
        EmptyRequest),
    "estimate_damage": (
        "Comparer les dégâts des attaques jouables : plage si l'attaque touche, moyenne avec précision, probabilité de KO. Calcul du moteur sur l'état actuel, sans jouer le tour.",
        EmptyRequest),
    "estimate_incoming_damage": (
        "Estimer le risque réel : dégâts et probabilité de KO des attaques adverses déjà utilisées, "
        "sur les PV actuels et après une potion, et l'ordre d'action si les deux attaquent.",
        EmptyRequest),
    "select_attack": ("Terminer la décision en sélectionnant un attack_slot jouable, sans exécuter le tour.",
                      SelectAttackRequest),
    "select_potion": ("Terminer la décision en utilisant une potion ce tour-ci, à la place d'une attaque, sans exécuter le tour. "
                      "Refusé si les PV sont pleins ou si le stock est vide.",
                      SelectPotionRequest),
    "estimate_healing": (
        "Estimer les PV restaurés par une potion, les PV après soin et le nombre de potions restantes. Vérifie si le soin est possible sans consommer de potion ni jouer le tour.",
        EmptyRequest,
    ),
}


def tool_schemas() -> list[dict[str, Any]]:
    return [{"type": "function", "function": {"name": name, "description": description,
                                              "parameters": request.model_json_schema()}}
            for name, (description, request) in _DEFINITIONS.items()]


def selection_tool_schemas(context: ToolsContext) -> list[dict[str, Any]]:
    """Seuls les outils de sélection réellement possibles : le dernier round doit conclure."""
    allowed = {"select_attack"} if context.legal_moves else set()
    if context.can_use_potion:
        allowed.add("select_potion")
    return [schema for schema in tool_schemas() if schema["function"]["name"] in allowed]


def tools_version() -> str:
    """Empreinte du contrat d'outils : une conversation créée avec un autre contrat doit être recréée."""
    contract = json.dumps(tool_schemas(), ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(contract.encode("utf-8")).hexdigest()[:16]


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
        result = {"moves": [asdict(move) for move in context.legal_moves], "potion_available": context.can_use_potion}
        if not context.legal_moves:
            result["note"] = "Aucune attaque jouable : utilise select_potion pour agir ce tour."
    elif call.name == "evaluate_matchups":
        result = {"matchups": [_matchup(move, context.view.opponent.types) for move in context.legal_moves]}
    elif call.name == "estimate_damage":
        result = {"estimates": [estimate_move(context, move) for move in context.legal_moves],
                  "assumption": "Attaque isolée sur les PV actuels ; suppose que l'acteur peut agir. Ne prédit ni le choix adverse ni un combat complet."}
    elif call.name == "estimate_healing":
        healing = estimate_healing(context)
        result = {
            "estimate_healing": healing,
            "assumption": (
                "Estimation d'une potion restaurant jusqu'à 20 PV. "
                "Ne prédit ni l'action adverse ni le déroulement du combat."
            ),
        }
        if healing["available"]:
            result["next_step"] = "Appeler select_potion pour appliquer ce soin à la place d'une attaque."
    elif call.name == "estimate_incoming_damage":
        result = estimate_incoming_damage(context)
    elif call.name == "select_potion":
        assert isinstance(request, SelectPotionRequest)
        # Même contrôle que l'estimation, elle-même alignée sur le moteur.
        healing = estimate_healing(context)
        if not healing["available"]:
            return {"error": "potion_unavailable", "message": healing["reason"]}
        context.decision = AttackDecision(None, "llm", request.comment, action_type="potion")
        result = {"selected_action": "potion", "healed": healing["healed"]}
    else:
        assert isinstance(request, SelectAttackRequest)
        if not any(move.attack_slot == request.attack_slot for move in context.legal_moves):
            return {"error": "illegal_move", "message": "Choisir un attack_slot retourné par list_legal_moves."}
        context.decision = AttackDecision(request.attack_slot, "llm", request.comment)
        result = {"selected_slot": request.attack_slot}
    context.observations[call.name] = result
    return result
