"""Décision adverse bornée, indépendante de FastAPI, SQLite et du SDK Mistral."""

import asyncio
from dataclasses import replace
import json
import logging
from time import perf_counter
from typing import Any, Protocol
from collections.abc import Callable

from pokemon_battle.application.battle_service import InvalidMoveError
from pokemon_battle.core.exceptions import MissingCredentials, MistralTimeout, MistralUnavailable
from pokemon_battle.types import effectiveness
from .generation import Completion, Message, ToolCall
from .tools import execute_tool, tool_schemas
from .tools_context import AttackDecision, ToolsContext

logger = logging.getLogger(__name__)


class CompletionClient(Protocol):
    async def complete(self, messages: list[Message], *, tools: list[dict[str, Any]] | None = None,
                       tool_choice: str = "auto") -> Completion: ...


class OpponentPolicy(Protocol):
    async def choose(self, context: ToolsContext) -> AttackDecision: ...


class LocalOpponent:
    async def choose(self, context: ToolsContext) -> AttackDecision:
        if context.decision is not None:
            return context.decision
        if not context.legal_moves:
            if context.can_use_potion:
                context.decision = AttackDecision(None, "local", action_type="potion")
                return context.decision
            raise InvalidMoveError("Le combattant IA n'a plus d'action disponible")
        # Heuristique stable : puissance, précision, efficacité et bonus du même type.
        # Aucun tirage ni calcul réel de dégâts n'est effectué par cette stratégie.
        move = max(context.legal_moves, key=lambda move: (
            move.power * move.accuracy * effectiveness(move.type, context.view.opponent.types)
            * (3 if move.type in context.view.fighter.types else 2), -move.attack_slot,
        ))
        context.decision = AttackDecision(move.attack_slot, "local")
        return context.decision


class ToolCallingOpponent:
    def __init__(self, client: CompletionClient, *, max_rounds: int = 4,
                 max_tool_calls: int = 8, timeout_seconds: float = 8,
                 on_tool_result: Callable[[ToolCall, dict[str, Any]], None] | None = None):
        if type(max_rounds) is not int or max_rounds < 1 or type(max_tool_calls) is not int or max_tool_calls < 1:
            raise ValueError("Les budgets d'appels doivent être des entiers positifs")
        if not 0 < timeout_seconds < float("inf"):
            raise ValueError("Le délai doit être positif et fini")
        self.client = client
        self.max_rounds = max_rounds
        self.max_tool_calls = max_tool_calls
        self.timeout_seconds = timeout_seconds
        self.on_tool_result = on_tool_result

    async def choose(self, context: ToolsContext) -> AttackDecision:
        if context.decision is not None:
            return context.decision
        if not context.has_playable_action:
            raise InvalidMoveError("Le combattant IA n'a plus d'action disponible")
        started = perf_counter()
        try:
            try:
                async with asyncio.timeout(self.timeout_seconds):
                    return await self._run(context)
            except (TimeoutError, MistralTimeout):
                reason = "timeout"
            except (MissingCredentials, MistralUnavailable):
                reason = "unavailable"
            return await self._fallback(context, reason)
        finally:
            context.metrics.elapsed_ms = round((perf_counter() - started) * 1000, 3)

    async def _fallback(self, context: ToolsContext, reason: str) -> AttackDecision:
        logger.warning("Décision IA locale combat=%s tour=%s cause=%s", context.battle_id, context.view.turn, reason)
        choice = await LocalOpponent().choose(context)
        context.decision = replace(choice, fallback_reason=reason)
        context.metrics.event("fallback", reason=reason, action_type=choice.action_type, attack_slot=choice.attack_slot)
        return context.decision

    async def _run(self, context: ToolsContext) -> AttackDecision:
        # Cette liste est propre à l'appel : aucun historique ni contexte global partagé.
        messages = [Message("system", "Tu contrôles le combattant IA dans un duel Pokémon. "
                                      "Observe le combat avec les outils. Utilise uniquement les slots jouables. "
                                      "Les résultats des outils métier font référence, même s'ils contredisent tes connaissances. "
                                      "Consulte estimate_damage avant de sélectionner : il inclut les types, statistiques et arrondis du moteur. "
                                      "Consulte estimate_healing lorsque tes PV sont inférieurs au maximum et que tu disposes de potions. "
                                      "Compare l'intérêt de te soigner avec celui d'attaquer, en tenant compte des PV actuels, "
                                      "des dégâts attendus, de la probabilité de KO adverse et du nombre de potions restantes. "
                                      "Privilégie une attaque si elle permet probablement de terminer le combat immédiatement. "
                                      "Envisage une potion si tes PV sont faibles et que le soin améliore tes chances de survie. "
                                      "N'utilise pas de potion si les PV sont au maximum, si aucune potion n'est disponible, "
                                      "ou si le combattant est KO. "
                                      "Le soin consomme un tour et l'action adverse reste inconnue. "
                                      "Compare expected_damage (précision comprise) et ko_probability ; ne confonds pas dégâts si touche et dégâts attendus. "
                                      "evaluate_matchups reste disponible pour expliquer les types. Regroupe les outils de lecture dans un même appel si utile. "
                                      "Un multiplicateur de 0 (immune) signifie aucun dégât ; inférieur à 1 (resisted), "
                                      "dégâts réduits ; 1 (neutral), efficacité normale ; supérieur à 1 (super_effective), "
                                      "dégâts amplifiés. Évite une attaque sans effet quand une autre attaque jouable peut toucher. "
                                      "Compare aussi puissance, précision et bonus du même type ; l'efficacité seule n'est pas un dégât. "
                                      "Utilise le nom et le champ attack_slot exacts des résultats, sans inventer d'emplacement. "
                                      "Termine avec select_attack ou select_potion selon la meilleure décision tactique. "
                                      "Le choix actuel du joueur est inconnu. "
                                      "Les commentaires sont de courtes répliques, pas un raisonnement détaillé."),
                    Message("user", "Choisis ton action pour ce tour : une attaque ou une potion.")]
        count = 0
        for _ in range(self.max_rounds):
            # Une copie évite qu'un client conserve une liste modifiée après sa requête.
            metrics = context.metrics
            metrics.model_requests += 1
            metrics.event("model_request", request=metrics.model_requests)
            started = perf_counter()
            try:
                completion = await self.client.complete(list(messages), tools=tool_schemas(), tool_choice="any")
            finally:
                metrics.model_time_ms += (perf_counter() - started) * 1000
            metrics.model_responses += 1
            metrics.add_usage(completion.usage)
            metrics.event("model_response", request=metrics.model_requests, tool_calls=len(completion.tool_calls))
            if not completion.tool_calls:
                return await self._fallback(context, "invalid_response")
            count += len(completion.tool_calls)
            metrics.tool_calls_requested += len(completion.tool_calls)
            if count > self.max_tool_calls:
                return await self._fallback(context, "tool_budget")
            messages.append(Message("assistant", completion.text, tool_calls=completion.tool_calls))
            for call in completion.tool_calls:
                result = execute_tool(context, call)
                if self.on_tool_result is not None:
                    self.on_tool_result(call, result)
                metrics.tool_calls_executed += 1
                metrics.tool_errors += int("error" in result)
                metrics.event("tool_result", tool=call.name, call_id=call.id,
                              status=result.get("error", "ok"), selected_slot=result.get("selected_slot"))
                messages.append(Message("tool", json.dumps(result, ensure_ascii=False),
                                        tool_call_id=call.id, name=call.name))
            if context.decision is not None:
                metrics.event("decision", action_type=context.decision.action_type,
                              attack_slot=context.decision.attack_slot, source=context.decision.source)
                return context.decision
        return await self._fallback(context, "round_budget")
