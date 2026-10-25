"""Un choix humain puis une décision IA, sans garder de transaction pendant le réseau."""

import asyncio
from collections.abc import Callable
from dataclasses import asdict, dataclass
from fractions import Fraction
import json
from time import time
from typing import Any
from uuid import UUID, uuid4
from pokemon_battle.domain import AttackAction, BattleAction

from pokemon_battle.application.battle_repository import BattleSession, StoredBattle, TurnResult
from pokemon_battle.application.battle_service import (
    BattleService, BattleNotFoundError, InvalidMoveError, TurnConflictError,
)
from .conversation import ConversationState, ConversationAdapter
from .opponent import ToolCallingOpponent
from .tools_context import AttackDecision, ToolsContext


@dataclass(frozen=True, slots=True)
class AiTurnResult:
    turn: TurnResult
    decision: dict[str, Any]
    metrics: dict[str, Any]


class AiBattleService:
    def __init__(self, battles: BattleService,
                 adapter_factory: Callable[[ConversationState, dict[str, Any]], ConversationAdapter], *,
                 timeout: float = 30, clock: Callable[[], float] = time,
                 rotation_turns: int = 3, max_prompt_tokens: int = 12000):
        if not 0 < timeout <= 60 or rotation_turns < 1 or max_prompt_tokens < 1:
            raise ValueError("Budgets IA invalides")
        self.battles, self.adapter_factory = battles, adapter_factory
        self.timeout, self.clock = timeout, clock
        self.rotation_turns, self.max_prompt_tokens = rotation_turns, max_prompt_tokens

    async def play_turn(self, battle_id: UUID, player_move: int | BattleAction, *, expected_turn: int,
                        idempotency_key: UUID) -> AiTurnResult:
        self._validate_command(player_move, expected_turn, idempotency_key)
        owner = str(uuid4())
        # Petites transactions SQLite dans un worker ; aucune connexion ne traverse un await réseau.
        prepared = await asyncio.to_thread(self._claim, battle_id, player_move, expected_turn, idempotency_key, owner)
        if isinstance(prepared, AiTurnResult):
            return prepared
        record, state = prepared
        try:
            context = ToolsContext.from_record(record, record.battle.second.id, expected_turn)
            await self._choose_attack(context, state)
            return await asyncio.to_thread(self._commit, battle_id, player_move, expected_turn,
                                           idempotency_key, owner, state, context)
        finally:
            await asyncio.shield(asyncio.to_thread(self._release, battle_id, owner))

    def _validate_command(self, move: int | BattleAction, turn: int, key: UUID) -> None:
        self.battles.normalize_action(move)
        if type(turn) is not int or turn < 0 or not isinstance(key, UUID):
            raise InvalidMoveError("Slot, tour et clé UUID valides obligatoires")

    def _action_data(self, move: int | BattleAction) -> dict:
        action = self.battles.normalize_action(move)
        return {"action_type": "attack", "attack_slot": action.attack_slot} if isinstance(action, AttackAction) else {"action_type": "potion"}

    async def _choose_attack(self, context: ToolsContext, state: dict[str, Any]) -> None:
        conversation = self._prepare_conversation(context, state)
        adapter = self.adapter_factory(conversation, self._tactical_memory(context, state))
        self._reset_if_model_changed(conversation, adapter.model)
        decision = await ToolCallingOpponent(adapter, timeout_seconds=self.timeout,
                                             on_tool_result=adapter.record_result).choose(context)
        self._remember_conversation(state, conversation, decision)

    def _prepare_conversation(self, context: ToolsContext, state: dict[str, Any]) -> ConversationState:
        conversation = ConversationState(**state.get("conversation", {}))
        rotated = (conversation.turns >= self.rotation_turns
                   or conversation.prompt_tokens >= self.max_prompt_tokens)
        if rotated:
            conversation = ConversationState()
        context.metrics.event("conversation", resumed=conversation.conversation_id is not None, rotated=rotated)
        return conversation

    def _tactical_memory(self, context: ToolsContext, state: dict[str, Any]) -> dict[str, Any]:
        # Aucun choix humain en cours ne figure dans cette mémoire.
        return {"task": "Choisis ton attaque. Consulte les outils pour l'état actuel faisant référence.",
                "battle_id": str(context.battle_id), "fighter_id": context.view.fighter.id,
                "current_turn": context.view.turn, "recent_resolved_turns": state.get("history", [])[-3:]}

    def _reset_if_model_changed(self, conversation: ConversationState, model: str) -> None:
        if conversation.model and conversation.model != model:
            conversation.conversation_id = None
            conversation.pending_results.clear()
            conversation.turns = 0

    def _remember_conversation(self, state: dict[str, Any], conversation: ConversationState,
                               decision: AttackDecision) -> None:
        if decision.source == "llm":
            conversation.turns += 1
            state["conversation"] = asdict(conversation)
        else:
            # Après un échec ambigu, ne jamais reprendre des appels en attente inconnus.
            state["conversation"] = asdict(ConversationState())

    def _claim(self, battle_id: UUID, move: int | BattleAction, turn: int, key: UUID,
               owner: str) -> AiTurnResult | tuple[StoredBattle, dict[str, Any]]:
        with self.battles.repository.transaction() as session:
            replay = self._replay_request(session, battle_id, move, turn, key)
            if replay is not None:
                return replay
            record = self._load_playable_battle(session, battle_id, move, turn)
            state = self._reserve_decision(session, record, owner)
            return record, state

    def _replay_request(self, session: BattleSession, battle_id: UUID, move: int | BattleAction,
                        turn: int, key: UUID) -> AiTurnResult | None:
        # Consulter le reçu avant l'état actuel permet aussi la reprise après KO.
        receipt = session.get_ai_request(battle_id, key)
        if receipt is not None:
            previous = receipt.get("player_action")
            if previous is None:
                previous = self._action_data(receipt["player_move"])
            if (previous, receipt["expected_turn"]) != (self._action_data(move), turn):
                raise TurnConflictError("Clé déjà utilisée avec une autre demande")
            return AiTurnResult(session.get_turn(battle_id, key).result, receipt["decision"], receipt["metrics"])
        if session.get_turn(battle_id, key) is not None:
            raise TurnConflictError("Clé déjà utilisée pour un tour manuel")
        return None

    def _load_playable_battle(self, session: BattleSession, battle_id: UUID, move: int | BattleAction,
                              turn: int) -> StoredBattle:
        record = session.get(battle_id)
        if record is None:
            raise BattleNotFoundError("Le combat n'existe pas")
        ToolsContext.from_record(record, record.battle.second.id, turn)
        self.battles.validate_action(record.battle.first, self.battles.normalize_action(move))
        return record

    def _reserve_decision(self, session: BattleSession, record: StoredBattle, owner: str) -> dict[str, Any]:
        state = session.get_ai_state(record.id) or {}
        if state.get("owner") and state.get("lease_until", 0) > self.clock():
            raise TurnConflictError("Une décision IA est déjà en cours ; réessaie avec la même clé")
        if state.get("owner"):
            state["conversation"] = asdict(ConversationState())
        state.update(owner=owner, lease_until=self.clock() + 120, fighter_id=record.battle.second.id)
        session.save_ai_state(record.id, state)
        return state

    def _commit(self, battle_id: UUID, move: int | BattleAction, turn: int, key: UUID, owner: str,
                state: dict[str, Any], context: ToolsContext) -> AiTurnResult:
        with self.battles.repository.transaction() as session:
            self._validate_reservation(session, battle_id, owner)
            result = self.battles.resolve_turn(session, battle_id, move, context.decision.attack_slot,
                                              expected_turn=turn, idempotency_key=key)
            self._save_resolved_session(session, result, state)
            response = AiTurnResult(result, asdict(context.decision), self._decision_metrics(context))
            self._save_request_receipt(session, battle_id, move, turn, key, response)
            return response

    def _validate_reservation(self, session: BattleSession, battle_id: UUID, owner: str) -> None:
        current = session.get_ai_state(battle_id)
        if not current or current.get("owner") != owner or current["lease_until"] <= self.clock():
            raise TurnConflictError("La réservation de décision IA a expiré")

    def _save_resolved_session(self, session: BattleSession, result: TurnResult, state: dict[str, Any]) -> None:
        events = [{"type": type(event).__name__, **asdict(event)} for event in result.events]
        # Les événements résolus sont publics ; pas de catalogue adverse ni de choix à venir.
        public_events = json.loads(json.dumps(
            events, default=lambda value: float(value) if isinstance(value, Fraction) else value))
        state["history"] = [*state.get("history", []), {"turn": result.record.battle.turn, "events": public_events}][-3:]
        state.update(owner=None, lease_until=0)
        session.save_ai_state(result.record.id, state)

    def _decision_metrics(self, context: ToolsContext) -> dict[str, Any]:
        metrics = asdict(context.metrics)
        metrics["usage_complete"] = context.metrics.complete_usage_reports == context.metrics.model_requests
        return metrics

    def _save_request_receipt(self, session: BattleSession, battle_id: UUID, move: int | BattleAction,
                              turn: int, key: UUID, response: AiTurnResult) -> None:
        session.save_ai_request(battle_id, key, {"player_action": self._action_data(move), "expected_turn": turn,
                                               "decision": response.decision, "metrics": response.metrics})

    def _release(self, battle_id: UUID, owner: str) -> None:
        with self.battles.repository.transaction() as session:
            state = session.get_ai_state(battle_id)
            if state and state.get("owner") == owner:
                # L'appel distant peut avoir été accepté : abandonner le curseur en cas de tour non validé.
                state.update(owner=None, lease_until=0, conversation=asdict(ConversationState()))
                session.save_ai_state(battle_id, state)
