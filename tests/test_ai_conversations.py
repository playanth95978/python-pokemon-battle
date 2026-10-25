"""Conversations persistantes, outils locaux et tours atomiques sans fournisseur réel."""

import asyncio
from dataclasses import asdict
import json
from random import Random
from uuid import uuid4

from fastapi.testclient import TestClient
import httpx
import pytest
from pydantic import SecretStr

from pokemon_battle.api.app import create_app
from pokemon_battle.application.ai.ai_battle_service import AiBattleService
from pokemon_battle.application.battle_service import BattleService, TurnConflictError, InvalidMoveError
from pokemon_battle.application.ai.conversation import ConversationState
from pokemon_battle.application.ai.generation import Message, ToolCall
from pokemon_battle.core.config import Settings
from pokemon_battle.core.exceptions import MistralUnavailable
from pokemon_battle.domain import Attack, Species, Stats
from pokemon_battle.engine import BattleEngine
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository, _SqliteSession
from pokemon_battle.mistral.client import MistralClient
from pokemon_battle.mistral.conversation_adapter import MistralConversationAdapter
from pokemon_battle.types import Type


def client_for(handler):
    settings = Settings.model_construct(mistral_api_key=SecretStr("cle-factice"), mistral_chat_model="modele-factice")
    return MistralClient(settings, transport=httpx.MockTransport(handler))


class Server:
    def __init__(self):
        self.requests = []

    def __call__(self, request):
        payload = json.loads(request.content)
        self.requests.append((request.url.path, payload))
        index = len(self.requests)
        inputs = payload["inputs"]
        if any(item.get("role") == "user" for item in inputs):
            name = "estimate_damage"
            args = {}
        else:
            assert inputs[0]["type"] == "function.result"
            assert "estimates" in json.loads(inputs[0]["result"])
            name, args = "select_attack", {"slot": 0, "comment": "Je joue."}
        return httpx.Response(200, json={"conversation_id": f"conv-{index}", "outputs": [
            {"type": "function.call", "tool_call_id": f"call-{index}", "name": name, "arguments": args}],
            "usage": {"prompt_tokens": 111, "completion_tokens": 7, "total_tokens": 118}})


@pytest.fixture
def battles(tmp_path):
    repository = SqliteBattleRepository(tmp_path / "battle.sqlite3")
    repository.initialize()
    species = Species("Test", (Type.NORMAL,), Stats(5000, 63, 77, 82, 91, 46),
                      (Attack("Charge", Type.NORMAL, 40, 100, 30),))
    return BattleService(repository, {"test": species}, BattleEngine(Random(42)))


def testLAdaptateurUtiliseLesEntreesMistralEtLeDernierIdentifiant():
    """Le backend renvoie function.result au bon appel sans réexpédier les messages précédents."""
    server = Server()
    async def run():
        client = client_for(server)
        try:
            state = ConversationState()
            adapter = MistralConversationAdapter(client, state, {"current_turn": 0})
            messages = [Message("system", "Consigne"), Message("user", "Choisis")]
            first = await adapter.complete(messages, tools=[], tool_choice="any")
            adapter.record_result(first.tool_calls[0], {"estimates": []})
            await adapter.complete(messages, tools=[], tool_choice="any")
            assert state.conversation_id == "conv-2"
            assert first.usage["total_tokens"] == 118
        finally:
            await client.aclose()
    asyncio.run(run())
    assert server.requests[0][0] == "/v1/conversations"
    assert server.requests[0][1]["store"] is True
    assert server.requests[0][1]["completion_args"]["tool_choice"] == "any"
    path, payload = server.requests[1]
    assert path == "/v1/conversations/conv-1"
    assert "model" not in payload and "instructions" not in payload
    assert payload["inputs"] == [{"object": "entry", "type": "function.result", "tool_call_id": "call-1",
                                   "result": '{"estimates": []}'}]


def testDeuxToursReprennentLaConversationMemeApresRecreationDuService(battles):
    """SQLite conserve le curseur et le résultat du select_attack à transmettre au tour suivant."""
    record = battles.create_battle("test", "test")
    server = Server()
    async def run():
        client = client_for(server)
        factory = lambda state, memory: MistralConversationAdapter(client, state, memory)
        try:
            first = await AiBattleService(battles, factory).play_turn(record.id, 0, expected_turn=0, idempotency_key=uuid4())
            second = await AiBattleService(battles, factory).play_turn(record.id, 0, expected_turn=1, idempotency_key=uuid4())
            assert first.turn.record.battle.turn == 1
            assert second.turn.record.battle.turn == 2
            assert second.metrics["tokens"]["total_tokens"] == 236
            assert second.decision["source"] == "llm"
        finally:
            await client.aclose()
    asyncio.run(run())
    path, payload = server.requests[2]
    assert path == "/v1/conversations/conv-2"
    assert payload["inputs"][0]["tool_call_id"] == "call-2"
    memory = json.loads(payload["inputs"][1]["content"])
    assert memory["current_turn"] == 1
    assert memory["recent_resolved_turns"][0]["turn"] == 1
    assert "player_move" not in json.dumps(memory)


@pytest.mark.parametrize("rotation,threshold", [(1, 12000), (3, 100)])
def testLaRotationRecreeUneConversationAvecMemoireCompacte(battles, rotation, threshold):
    """Un budget de tours ou de tokens atteint abandonne l'ancien historique détaillé au prochain tour."""
    record = battles.create_battle("test", "test")
    server = Server()
    async def run():
        client = client_for(server)
        service = AiBattleService(battles, lambda state, memory: MistralConversationAdapter(client, state, memory),
                                  rotation_turns=rotation, max_prompt_tokens=threshold)
        try:
            for turn in range(5):
                await service.play_turn(record.id, 0, expected_turn=turn, idempotency_key=uuid4())
        finally:
            await client.aclose()
    asyncio.run(run())
    path, payload = server.requests[8]
    assert path == "/v1/conversations"
    assert len(payload["inputs"]) == 1
    memory = json.loads(payload["inputs"][0]["content"])
    assert [item["turn"] for item in memory["recent_resolved_turns"]] == [2, 3, 4]
    with battles.repository.transaction() as session:
        assert len(session.get_ai_state(record.id)["history"]) == 3


def testUneRepriseIdempotenteNeRappellePasLeModele(battles):
    """La clé porte sur la commande humaine, sans dépendre d'un choix IA régénéré."""
    record = battles.create_battle("test", "test")
    server, key = Server(), uuid4()
    async def run():
        client = client_for(server)
        service = AiBattleService(battles, lambda state, memory: MistralConversationAdapter(client, state, memory))
        try:
            result = await service.play_turn(record.id, 0, expected_turn=0, idempotency_key=key)
            retry = await service.play_turn(record.id, 0, expected_turn=0, idempotency_key=key)
            assert asdict(result) == asdict(retry)
            with pytest.raises(TurnConflictError):
                await service.play_turn(record.id, 0, expected_turn=1, idempotency_key=key)
        finally:
            await client.aclose()
    asyncio.run(run())
    assert len(server.requests) == 2
    assert battles.get_battle(record.id).battle.turn == 1


def testDeuxRequetesConcurrentesNExecutentQuUneDecision(battles):
    """Une réservation en base couvre aussi plusieurs instances du service, sans transaction pendant le réseau."""
    record = battles.create_battle("test", "test")
    server = Server()
    async def run():
        entered, release = asyncio.Event(), asyncio.Event()
        async def handler(request):
            entered.set()
            await release.wait()
            return server(request)
        client = client_for(handler)
        service = AiBattleService(battles, lambda state, memory: MistralConversationAdapter(client, state, memory))
        try:
            first = asyncio.create_task(service.play_turn(record.id, 0, expected_turn=0, idempotency_key=uuid4()))
            await entered.wait()
            # Si une transaction restait ouverte, cette deuxième réservation ne pourrait pas lire/refuser.
            with pytest.raises(TurnConflictError):
                await service.play_turn(record.id, 0, expected_turn=0, idempotency_key=uuid4())
            release.set()
            assert (await first).turn.record.battle.turn == 1
        finally:
            release.set()
            await client.aclose()
    asyncio.run(run())
    assert len(server.requests) == 2


def testUnTourModifiePendantLeReseauRefuseLaDecisionPerimee(battles):
    """Un tour manuel concurrent peut gagner ; la décision IA perdante ne doit pas écraser son état."""
    record = battles.create_battle("test", "test")
    server = Server()
    def handler(request):
        if not server.requests:
            battles.play_turn(record.id, 0, 0, expected_turn=0, idempotency_key=uuid4())
        return server(request)
    async def run():
        client = client_for(handler)
        try:
            service = AiBattleService(battles, lambda state, memory: MistralConversationAdapter(client, state, memory))
            with pytest.raises(TurnConflictError):
                await service.play_turn(record.id, 0, expected_turn=0, idempotency_key=uuid4())
        finally:
            await client.aclose()
    asyncio.run(run())
    assert battles.get_battle(record.id).battle.turn == 1
    with battles.repository.transaction() as session:
        state = session.get_ai_state(record.id)
        assert state["owner"] is None
        assert state["conversation"]["conversation_id"] is None


def testUnePanneMistralUtiliseLeRepliEtNeConservePasDeDialogueIncomplet(battles):
    """Un refus fournisseur n'empêche pas le tour local, et le curseur ambigu est abandonné."""
    record = battles.create_battle("test", "test")
    async def run():
        client = client_for(lambda request: httpx.Response(503))
        try:
            service = AiBattleService(battles, lambda state, memory: MistralConversationAdapter(client, state, memory))
            result = await service.play_turn(record.id, 0, expected_turn=0, idempotency_key=uuid4())
            assert result.decision["source"] == "local"
            assert result.decision["fallback_reason"] == "unavailable"
        finally:
            await client.aclose()
    asyncio.run(run())
    with battles.repository.transaction() as session:
        assert session.get_ai_state(record.id)["conversation"]["conversation_id"] is None


def testUneAnnulationLibereLaReservationSansJouerLeTour(battles):
    """L'abandon de l'appelant ne doit pas déclencher un tour local ni laisser une réservation active."""
    record = battles.create_battle("test", "test")
    async def run():
        entered = asyncio.Event()
        async def handler(request):
            entered.set()
            await asyncio.Event().wait()
        client = client_for(handler)
        try:
            service = AiBattleService(battles, lambda state, memory: MistralConversationAdapter(client, state, memory))
            task = asyncio.create_task(service.play_turn(record.id, 0, expected_turn=0, idempotency_key=uuid4()))
            await entered.wait()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        finally:
            await client.aclose()
    asyncio.run(run())
    assert battles.get_battle(record.id).battle.turn == 0
    with battles.repository.transaction() as session:
        assert session.get_ai_state(record.id)["owner"] is None


def testUneErreurDeSauvegardeAnnuleLeTourEtLeCurseurEnsemble(battles, monkeypatch):
    """État, reçu et session doivent être validés atomiquement, même si la dernière écriture échoue."""
    record = battles.create_battle("test", "test")
    key = uuid4()
    def fail(*args):
        raise RuntimeError("Échec simulé du reçu IA")
    monkeypatch.setattr(_SqliteSession, "save_ai_request", fail)
    async def run():
        client = client_for(Server())
        try:
            service = AiBattleService(battles, lambda state, memory: MistralConversationAdapter(client, state, memory))
            with pytest.raises(RuntimeError, match="Échec simulé"):
                await service.play_turn(record.id, 0, expected_turn=0, idempotency_key=key)
        finally:
            await client.aclose()
    asyncio.run(run())
    assert asdict(battles.get_battle(record.id)) == asdict(record)
    with battles.repository.transaction() as session:
        assert session.get_turn(record.id, key) is None
        assert session.get_ai_state(record.id)["conversation"]["conversation_id"] is None


def testUneReservationExpireeEstRecuperableEtAncienProprietaireRefuse(battles):
    """Après un crash simulé, un nouveau worker reprend et le premier ne peut plus valider sa décision."""
    record = battles.create_battle("test", "test")
    now = [1000]
    service = AiBattleService(battles, lambda *args: None, clock=lambda: now[0])
    old_key, new_key = uuid4(), uuid4()
    service._claim(record.id, 0, 0, old_key, "ancien")
    now[0] = 1121
    _, state = service._claim(record.id, 0, 0, new_key, "nouveau")
    with pytest.raises(TurnConflictError, match="expiré"):
        service._commit(record.id, 0, 0, old_key, "ancien", state, None)
    service._release(record.id, "ancien")
    with battles.repository.transaction() as session:
        assert session.get_ai_state(record.id)["owner"] == "nouveau"
    service._release(record.id, "nouveau")


def testLaRouteExposeUnTourIaSansChoixAdverseDuClient(tmp_path):
    """Le contrôleur retourne état, événements, décision et métriques ; un retry rejoue le reçu."""
    server = Server()
    client = client_for(server)
    app = create_app(tmp_path / "api.sqlite3", conversation_adapter_factory=lambda state, memory: MistralConversationAdapter(client, state, memory))
    try:
        with TestClient(app) as http:
            battle = http.post("/battles", json={"first_species": "pikachu", "second_species": "charmander"}).json()
            body = {"player_move": 0, "expected_turn": 0, "idempotency_key": str(uuid4())}
            response = http.post(f"/battles/{battle['id']}/ai-turns", json=body)
            assert response.status_code == 200
            assert response.json()["battle"]["turn"] == 1
            assert response.json()["decision"]["source"] == "llm"
            assert http.post(f"/battles/{battle['id']}/ai-turns", json=body).json() == response.json()
            invalid = http.post(f"/battles/{battle['id']}/ai-turns", json={**body, "second_move": 1})
            assert invalid.status_code == 422
    finally:
        asyncio.run(client.aclose())
    assert len(server.requests) == 2


@pytest.mark.parametrize("payload", [
    {"conversation_id": "", "outputs": []},
    {"conversation_id": "conv", "outputs": [{"type": "function.call", "name": "select_attack", "arguments": {}}]},
    {"conversation_id": "conv", "outputs": [{"type": "tool.execution"}]},
])
def testUneReponseConversationsMalformeeNeDevientPasUneDecision(payload):
    """Une sortie inconnue ou sans identifiant d'appel suit le traitement d'indisponibilité fournisseur."""
    async def run():
        client = client_for(lambda request: httpx.Response(200, json=payload))
        try:
            adapter = MistralConversationAdapter(client, ConversationState(), {})
            with pytest.raises(MistralUnavailable):
                await adapter.complete([Message("system", "Consigne")])
        finally:
            await client.aclose()
    asyncio.run(run())
