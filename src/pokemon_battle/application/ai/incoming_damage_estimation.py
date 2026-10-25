"""Risque réel encouru : attaques adverses déjà révélées, sur les PV actuels et après une potion."""

from typing import Any

from pokemon_battle.domain import potion_healing
from .damage_estimation import damage_rolls, estimate_move, ko_probability
from .tools_context import MoveView, ToolsContext


def estimate_incoming_damage(context: ToolsContext) -> dict[str, Any]:
    actor, opponent = context.view.fighter, context.view.opponent
    hp_after_potion = actor.hp + potion_healing(actor.hp, actor.max_hp) if context.can_use_potion else None
    threats = [_threat(context, move, hp_after_potion) for move in context.view.opponent_revealed_moves if move.pp > 0]
    turn_order = _turn_order(actor.stats.speed, opponent.stats.speed)
    risk_now = max((item["ko_probability_now"] for item in threats), default=None)
    risk_after = max((item["ko_probability_after_potion"] for item in threats
                      if item["ko_probability_after_potion"] is not None), default=None)
    ko_chances = _ko_before_riposte(context, turn_order)
    finishing = [name for name, probability in ko_chances if probability == 1.0]
    verdict = {
        "hp_now": actor.hp,
        "hp_after_potion": hp_after_potion,
        "lethal_now": risk_now == 1.0,
        "attack_ko_before_riposte": finishing,
        "potion_prevents_ko": risk_now is not None and risk_now > 0 and risk_after == 0.0,
        "best_ko_before_riposte": _best(ko_chances),
    }
    return {
        **verdict,
        "summary": _summary(verdict, risk_now, risk_after, threats, turn_order),
        "revealed_attacks": threats,
        "max_ko_probability_now": risk_now,
        "max_ko_probability_after_potion": risk_after,
        "turn_order": turn_order,
        "assumption": ("Seules les attaques adverses déjà utilisées sont connues ; l'adversaire peut en avoir d'autres. "
                       "Une potion agit toujours avant l'attaque adverse. Ne prédit pas le choix du joueur."),
    }


def _threat(context: ToolsContext, move: MoveView, hp_after_potion: int | None) -> dict[str, Any]:
    actor, opponent = context.view.fighter, context.view.opponent
    # Dégâts bruts (bornés aux PV max seulement) : des dégâts tronqués aux PV actuels masquent l'écart réel.
    damages = damage_rolls(opponent, actor, move, actor.max_hp)
    after_potion = None
    if hp_after_potion is not None:
        after_potion = float(ko_probability(damages, hp_after_potion, move.accuracy))
    return {
        "name": move.name, "type": move.type.value, "category": move.category.value,
        "power": move.power, "accuracy": move.accuracy, "pp": move.pp,
        "min_damage_on_hit": min(damages), "max_damage_on_hit": max(damages),
        "ko_probability_now": float(ko_probability(damages, actor.hp, move.accuracy)),
        "ko_probability_after_potion": after_potion,
    }


def _ko_before_riposte(context: ToolsContext, turn_order: str) -> list[tuple[str, float]]:
    # Un KO n'empêche la riposte que si l'agent agit avant l'adversaire.
    if turn_order != "agent_attacks_first":
        return []
    return [(move.name, estimate_move(context, move)["ko_probability"]) for move in context.legal_moves]


def _best(ko_chances: list[tuple[str, float]]) -> dict[str, Any] | None:
    best = max(ko_chances, key=lambda item: item[1], default=None)
    if best is None or best[1] == 0:
        return None
    return {"name": best[0], "probability": best[1]}


def _summary(verdict: dict[str, Any], risk_now: float | None, risk_after: float | None,
             threats: list[dict[str, Any]], turn_order: str) -> str:
    if not threats:
        return "Aucune attaque adverse révélée : le risque de KO n'est pas connu."
    parts = [f"Avec {verdict['hp_now']} PV, une attaque adverse révélée te met KO ce tour avec une probabilité de {risk_now}."]
    best = verdict["best_ko_before_riposte"]
    if verdict["attack_ko_before_riposte"]:
        parts.append(f"{', '.join(verdict['attack_ko_before_riposte'])} met l'adversaire KO à coup sûr avant sa riposte.")
    elif turn_order != "agent_attacks_first":
        parts.append("Tu n'agis pas avant l'adversaire : aucune attaque n'empêche sa riposte.")
    elif best is not None:
        parts.append(f"Aucun KO garanti avant la riposte ; meilleure chance : {best['name']} ({best['probability']}).")
    else:
        parts.append("Aucune de tes attaques ne peut mettre l'adversaire KO avant sa riposte.")
    if verdict["hp_after_potion"] is not None:
        parts.append(f"Après une potion, tu aurais {verdict['hp_after_potion']} PV et ce risque serait de {risk_after}.")
    else:
        parts.append("Aucune potion n'est utilisable.")
    return " ".join(parts)


def _turn_order(actor_speed: int, opponent_speed: int) -> str:
    # Même règle que le moteur quand les deux attaquent ; une égalité est tirée au sort.
    if actor_speed > opponent_speed:
        return "agent_attacks_first"
    if actor_speed < opponent_speed:
        return "opponent_attacks_first"
    return "random"
