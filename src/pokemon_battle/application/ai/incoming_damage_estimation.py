"""Risque réel encouru : attaques adverses déjà révélées, sur les PV actuels et après une potion."""

from typing import Any

from pokemon_battle.domain import potion_healing
from .damage_estimation import damage_rolls, estimate_move, ko_probability
from .tools_context import MoveView, ToolsContext


def estimate_incoming_damage(context: ToolsContext) -> dict[str, Any]:
    actor, opponent = context.view.fighter, context.view.opponent
    hp_after_potion = actor.hp + potion_healing(actor.hp, actor.max_hp) if context.can_use_potion else None
    threats = [_threat(context, move, hp_after_potion) for move in context.view.opponent_revealed_moves
               if move.pp > 0 and move.deals_damage]
    turn_order = _turn_order(actor.effective_speed, opponent.effective_speed)
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
        "agent_first_probability": _FIRST_PROBABILITY[turn_order],
    }
    return {
        **verdict,
        "summary": _summary(verdict, risk_now, risk_after, threats, turn_order),
        "revealed_attacks": threats,
        "max_ko_probability_now": risk_now,
        "max_ko_probability_after_potion": risk_after,
        "turn_order": turn_order,
        "assumption": ("Seules les attaques adverses déjà utilisées sont connues ; l'adversaire peut en avoir d'autres. "
                       "Une potion agit toujours avant l'attaque adverse. L'ordre utilise la vitesse effective "
                       "(crans, paralysie) et la priorité des attaques ; un paralysé n'agit que 3 fois sur 4. "
                       "Ne prédit pas le choix du joueur."),
    }


def _threat(context: ToolsContext, move: MoveView, hp_after_potion: int | None) -> dict[str, Any]:
    actor, opponent = context.view.fighter, context.view.opponent
    # Dégâts bruts (bornés aux PV max seulement) : des dégâts tronqués aux PV actuels masquent l'écart réel.
    damages = damage_rolls(opponent, actor, move, actor.max_hp)
    after_potion = None
    if hp_after_potion is not None:
        after_potion = float(ko_probability(damages, hp_after_potion, move.hit_chance) * opponent.act_chance)
    return {
        "name": move.name, "type": move.type.value, "category": move.category.value,
        "power": move.power, "accuracy": move.accuracy, "pp": move.pp,
        "min_damage_on_hit": min(damages), "max_damage_on_hit": max(damages),
        "ko_probability_now": float(ko_probability(damages, actor.hp, move.hit_chance) * opponent.act_chance),
        "ko_probability_after_potion": after_potion,
    }


# Probabilité que l'agent agisse avant l'adversaire si les deux attaquent ; une égalité est tirée au sort à 50 %.
_FIRST_PROBABILITY = {"agent_attacks_first": 1.0, "random": 0.5, "opponent_attacks_first": 0.0}


def guaranteed_ko_before_riposte(context: ToolsContext) -> list[str]:
    """Attaques qui mettent l'adversaire KO à coup sûr avant qu'il n'agisse."""
    actor, opponent = context.view.fighter, context.view.opponent
    turn_order = _turn_order(actor.effective_speed, opponent.effective_speed)
    return [name for name, probability in _ko_before_riposte(context, turn_order) if probability == 1.0]


def _ko_before_riposte(context: ToolsContext, turn_order: str) -> list[tuple[str, float]]:
    # Un KO n'empêche la riposte que si l'agent agit avant l'adversaire, et s'il agit vraiment.
    act_chance = float(context.view.fighter.act_chance)
    chances = []
    for move in context.legal_moves:
        first = _first_probability(context, move, turn_order)
        if move.deals_damage and first > 0:
            chances.append((move.name, estimate_move(context, move)["ko_probability"] * first * act_chance))
    return chances


def _first_probability(context: ToolsContext, move: MoveView, turn_order: str) -> float:
    """Une priorité supérieure à toutes celles révélées par l'adversaire passe avant la vitesse."""
    opponent_priority = max((item.priority for item in context.view.opponent_revealed_moves), default=0)
    if move.priority > opponent_priority:
        return 1.0
    return _FIRST_PROBABILITY[turn_order]


def _best(ko_chances: list[tuple[str, float]]) -> dict[str, Any] | None:
    best = max(ko_chances, key=lambda item: item[1], default=None)
    if best is None or best[1] == 0:
        return None
    return {"name": best[0], "probability": best[1]}


def _summary(verdict: dict[str, Any], risk_now: float | None, risk_after: float | None,
             threats: list[dict[str, Any]], turn_order: str) -> str:
    if not threats:
        return "Aucune attaque adverse révélée : le risque de KO n'est pas connu."
    risk = f"une attaque adverse révélée te met KO ce tour avec une probabilité de {risk_now}."
    finishing = verdict["attack_ko_before_riposte"]
    if finishing:
        # Le fait décisif d'abord : un KO garanti avant la riposte annule la menace qui suit.
        parts = [f"{', '.join(finishing)} met l'adversaire KO à coup sûr avant qu'il ne puisse riposter : "
                 "son attaque n'aura pas lieu.",
                 f"Sans ce KO, avec {verdict['hp_now']} PV, {risk}"]
    else:
        parts = [f"Avec {verdict['hp_now']} PV, {risk}", _riposte_sentence(verdict["best_ko_before_riposte"], turn_order)]
    if verdict["hp_after_potion"] is not None:
        parts.append(f"Après une potion, tu aurais {verdict['hp_after_potion']} PV et ce risque serait de {risk_after}.")
    else:
        parts.append("Aucune potion n'est utilisable.")
    return " ".join(parts)


def _riposte_sentence(best: dict[str, Any] | None, turn_order: str) -> str:
    if turn_order == "opponent_attacks_first":
        return "Tu n'agis pas avant l'adversaire : aucune attaque n'empêche sa riposte."
    if turn_order == "random":
        tie = "Les vitesses sont égales : tu as 50 % de chances d'agir en premier. Le KO avant la riposte n'est donc pas garanti"
        return f"{tie} ; meilleure chance : {best['name']} ({best['probability']})." if best is not None else f"{tie}."
    if best is not None:
        return f"Aucun KO garanti avant la riposte ; meilleure chance : {best['name']} ({best['probability']})."
    return "Aucune de tes attaques ne peut mettre l'adversaire KO avant sa riposte."


def _turn_order(actor_speed: int, opponent_speed: int) -> str:
    # Même règle que le moteur quand les deux attaquent ; une égalité est tirée au sort.
    if actor_speed > opponent_speed:
        return "agent_attacks_first"
    if actor_speed < opponent_speed:
        return "opponent_attacks_first"
    return "random"
