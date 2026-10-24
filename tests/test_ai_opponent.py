"""Décisions adverses reproductibles, sans accès au réseau ni au stockage."""

import asyncio
from dataclasses import FrozenInstanceError, asdict
import json
from uuid import UUID

import httpx
import pytest
from pydantic import SecretStr

from pokemon_battle.application.ai.generation import Completion, ToolCall
from pokemon_battle.application.ai.opponent import LocalOpponent, ToolCallingOpponent
from pokemon_battle.application.ai.tools import execute_tool, tool_schemas
from pokemon_battle.application.ai.tools_context import ToolsContext
from pokemon_battle.application.battle_repository import StoredBattle
from pokemon_battle.application.battle_service import BattleFinishedError, InvalidMoveError, TurnConflictError
from pokemon_battle.core.exceptions import MissingCredentials, MistralUnavailable
from pokemon_battle.core.config import Settings
from pokemon_battle.domain import Attack, Category, Fighter, Species, Stats
from pokemon_battle.engine import Battle
from pokemon_battle.types import Type
from pokemon_battle.mistral.client import MistralClient
from pokemon_battle.mistral.llm_adapter import MistralLLMAdapter


@pytest.fixture
def record():
    actor = Fighter("ai", Species("Adversaire", (Type.WATER,), Stats(101, 62, 53, 84, 75, 96), (
        Attack("Flamme", Type.FIRE, 60, 90, 15, Category.SPECIAL),
        Attack("Eau", Type.WATER, 40, 100, 20, Category.SPECIAL),
        Attack("Attaque épuisée", Type.WATER, 110, 80, 5, Category.SPECIAL),
    )))
    opponent = Fighter("human", Species("Joueur", (Type.FIRE,), Stats(131, 71, 63, 82, 54, 45), (
        Attack("Choix privé", Type.NORMAL, 30, 95, 12),
    )))
    actor.hp, actor.pp = 73, [14, 19, 0]
    opponent.hp = 99
    return StoredBattle(UUID("00000000-0000-0000-0000-000000000001"), Battle(opponent, actor, turn=2))


def context(record):
    return ToolsContext.from_record(record, "ai", expected_turn=2)


def call(name, arguments="{}", identifier="call-1"):
    return ToolCall(identifier, name, arguments)


class ScriptedClient:
    def __init__(self, *replies):
        self.replies = iter(replies)
        self.requests = []

    async def complete(self, messages, **kwargs):
        self.requests.append((messages, kwargs))
        return next(self.replies)


def testLeContexteEstUnInstantaneSansChoixPriveNiFighterMutable(record):
    """Les changements ultérieurs du combat ne doivent ni modifier la vue ni dévoiler les attaques adverses."""
    ctx = context(record)
    record.battle.second.hp = 1
    record.battle.second.pp[1] = 0
    assert ctx.view.fighter.hp == 73
    assert [move.slot for move in ctx.legal_moves] == [0, 1]
    assert ctx.view.opponent.hp == 99
    assert "Choix privé" not in json.dumps(asdict(ctx.view))
    with pytest.raises(FrozenInstanceError):
        ctx.view.fighter.hp = 5


@pytest.mark.parametrize("change, error", [("turn", TurnConflictError), ("finished", BattleFinishedError), ("fighter", InvalidMoveError), ("pp", InvalidMoveError)])
def testUneDecisionInvalideEstRefuseeAvantLeModele(record, change, error):
    """Un état périmé, terminé, épuisé ou un combattant étranger ne doit pas démarrer une décision."""
    fighter = "ai"
    if change == "turn":
        record.battle.turn = 3
    elif change == "finished":
        record.battle.first.hp = 0
    elif change == "fighter":
        fighter = "intrus"
    else:
        record.battle.second.pp[:] = [0, 0, 0]
    with pytest.raises(error):
        ToolsContext.from_record(record, fighter, 2)


def testLesOutilsPartagentLeContexteSansMuterLeCombat(record):
    """Les vues, l'efficacité et la décision sont mémorisées uniquement dans le contexte de travail."""
    before = asdict(record)
    ctx = context(record)
    view = execute_tool(ctx, call("inspect_battle"))
    moves = execute_tool(ctx, call("list_legal_moves"))
    matchups = execute_tool(ctx, call("evaluate_matchups"))
    assert view["fighter"]["hp"] == 73
    assert view["opponent"]["hp"] == 99
    assert [move["slot"] for move in moves["moves"]] == [0, 1]
    assert matchups == {"matchups": [{"slot": 0, "type": "fire", "multiplier": 0.5}, {"slot": 1, "type": "water", "multiplier": 2.0}]}
    assert execute_tool(ctx, call("select_attack", '{"slot":1,"comment":"À toi de jouer !"}')) == {"selected_slot": 1}
    assert ctx.decision.slot == 1
    assert ctx.decision.source == "llm"
    assert ctx.observations["list_legal_moves"] == moves
    assert asdict(record) == before


@pytest.mark.parametrize("name, arguments, error", [
    ("delete_battle", "{}", "unknown_tool"),
    ("inspect_battle", '{"battle_id":"intrus"}', "invalid_arguments"),
    ("select_attack", '{"slot":true}', "invalid_arguments"),
    ("select_attack", '{"slot":"1"}', "invalid_arguments"),
    ("select_attack", '{"slot":2}', "illegal_move"),
    ("select_attack", '{"slot":3}', "illegal_move"),
    ("select_attack", '{"slot":4}', "invalid_arguments"),
    ("select_attack", "[1]", "invalid_arguments"),
    ("select_attack", "{", "invalid_arguments"),
])
def testLesArgumentsEtLesOutilsSontValidesAvantSelection(record, name, arguments, error):
    """Les noms inconnus, slots illégaux et conversions implicites ne doivent jamais sélectionner d'attaque."""
    ctx = context(record)
    assert execute_tool(ctx, call(name, arguments))["error"] == error
    assert ctx.decision is None


def testLeChoixFinalNePeutPasEtreEcraseParUnAutreOutil(record):
    """La première sélection valide termine la décision, même dans un lot d'appels."""
    ctx = context(record)
    execute_tool(ctx, call("select_attack", '{"slot":1}'))
    assert execute_tool(ctx, call("select_attack", '{"slot":0}')) == {"error": "decision_already_selected"}
    assert ctx.decision.slot == 1


def testLaBoucleReinjecteLesResultatsAvecLesBonsIdentifiants(record):
    """Chaque résultat d'outil rejoint le dialogue avant que le modèle ne sélectionne son attaque."""
    client = ScriptedClient(
        Completion(None, {}, (call("inspect_battle", identifier="inspect"), call("list_legal_moves", identifier="moves"))),
        Completion(None, {}, (call("select_attack", '{"slot":1}', "select"),)),
    )
    ctx = context(record)
    choice = asyncio.run(ToolCallingOpponent(client).choose(ctx))
    assert (choice.slot, choice.source, choice.fallback_reason) == (1, "llm", None)
    messages, options = client.requests[1]
    assert options["tool_choice"] == "any"
    assert {tool["function"]["name"] for tool in options["tools"]} == {"inspect_battle", "list_legal_moves", "evaluate_matchups", "select_attack"}
    assert [message.tool_call_id for message in messages if message.role == "tool"] == ["inspect", "moves"]
    assert json.loads(messages[-1].content)["moves"][1]["pp"] == 19
    assert len(client.requests[0][0]) == 2


def testLeModelePeutCorrigerUnAppelInvalide(record):
    """Une erreur d'arguments est renvoyée au modèle plutôt que d'exécuter un mauvais slot."""
    client = ScriptedClient(Completion(None, {}, (call("select_attack", '{"slot":2}'),)),
                            Completion(None, {}, (call("select_attack", '{"slot":1}', "corrected"),)))
    choice = asyncio.run(ToolCallingOpponent(client).choose(context(record)))
    assert choice.source == "llm"
    assert json.loads(client.requests[1][0][-1].content)["error"] == "illegal_move"


@pytest.mark.parametrize("limit, expected_requests, reason", [("rounds", 2, "round_budget"), ("calls", 1, "tool_budget")])
def testLesBudgetsArretentLaBoucleAvecUnRepliLegal(record, limit, expected_requests, reason):
    """Un modèle qui inspecte indéfiniment ne doit pas immobiliser une partie."""
    reply = Completion(None, {}, (call("inspect_battle"), call("list_legal_moves", identifier="second")))
    client = ScriptedClient(reply, reply)
    policy = ToolCallingOpponent(client, max_rounds=2, max_tool_calls=1 if limit == "calls" else 8)
    ctx = context(record)
    choice = asyncio.run(policy.choose(ctx))
    assert (choice.slot, choice.source, choice.fallback_reason) == (1, "local", reason)
    assert len(client.requests) == expected_requests
    if limit == "calls":
        assert ctx.observations == {}


@pytest.mark.parametrize("error", [MissingCredentials, MistralUnavailable])
def testLesErreursFournisseurDeclenchentLeRepliLocal(record, error):
    """La stratégie de secours ne dépend ni d'une clé ni du fournisseur disponible."""
    class FailingClient:
        async def complete(self, *args, **kwargs):
            raise error()
    choice = asyncio.run(ToolCallingOpponent(FailingClient()).choose(context(record)))
    assert (choice.slot, choice.source, choice.fallback_reason) == (1, "local", "unavailable")


def testUnDelaiGlobalAnnuleLaRequeteEtChoisitLocalement(record):
    """La requête bloquée est annulée au terme du budget global, sans attendre le timeout HTTP."""
    cancelled = []
    class SlowClient:
        async def complete(self, *args, **kwargs):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.append(True)
    choice = asyncio.run(ToolCallingOpponent(SlowClient(), timeout_seconds=0.01).choose(context(record)))
    assert choice.fallback_reason == "timeout"
    assert choice.slot == 1
    assert cancelled == [True]


def testUneAnnulationDuDemandeurNeDeclenchePasDeDecisionDeSecours(record):
    """Une requête utilisateur annulée doit rester annulée et ne pas produire d'action tardive."""
    class CancelledClient:
        async def complete(self, *args, **kwargs):
            raise asyncio.CancelledError()
    ctx = context(record)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(ToolCallingOpponent(CancelledClient()).choose(ctx))
    assert ctx.decision is None


def testLesDecisionsConcurrentesNePartagentPasLeursContextes(record):
    """Un même adaptateur sert plusieurs décisions, mais chaque conversation reste isolée."""
    ctx_a, ctx_b = context(record), context(record)
    class ConcurrentClient:
        async def complete(self, messages, **kwargs):
            await asyncio.sleep(0)
            return Completion(None, {}, (call("select_attack", '{"slot":1}'),))
    async def check():
        policy = ToolCallingOpponent(ConcurrentClient())
        return await asyncio.gather(policy.choose(ctx_a), policy.choose(ctx_b))
    assert [choice.slot for choice in asyncio.run(check())] == [1, 1]
    ctx_a.observations.clear()
    assert ctx_b.observations == {"select_attack": {"selected_slot": 1}}


def testLesSchemasRefusentLesChampsSupplementairesEtLeRepliEstStable(record):
    """Les contrats exposés correspondent à la validation réelle et la stratégie locale reste déterministe."""
    for tool in tool_schemas():
        assert tool["function"]["parameters"]["additionalProperties"] is False
    assert asyncio.run(LocalOpponent().choose(context(record))).slot == 1
    assert asyncio.run(LocalOpponent().choose(context(record))).slot == 1


def testUneReponseLibreNeDevientJamaisUnChoixExecute(record):
    """Une phrase du modèle ne doit pas être interprétée comme un numéro de slot."""
    client = ScriptedClient(Completion("Je choisis le slot 0", {}))
    choice = asyncio.run(ToolCallingOpponent(client).choose(context(record)))
    assert (choice.slot, choice.source, choice.fallback_reason) == (1, "local", "invalid_response")


def testLaBoucleFonctionneAvecLAdaptateurMistralEtUnTransportSimule(record):
    """Le protocole applicatif et la sérialisation HTTP préservent les résultats sans exposer les attaques du joueur."""
    payloads = []
    def handle(request):
        payload = json.loads(request.content)
        payloads.append(payload)
        if len(payloads) == 1:
            name, arguments, identifier = "inspect_battle", "{}", "inspect01"
        else:
            result = payload["messages"][-1]
            assert result["tool_call_id"] == "inspect01"
            assert json.loads(result["content"])["fighter"]["hp"] == 73
            name, arguments, identifier = "select_attack", '{"slot":1}', "select001"
        return httpx.Response(200, json={"choices": [{"message": {"content": None, "tool_calls": [
            {"id": identifier, "type": "function", "function": {"name": name, "arguments": arguments}},
        ]}}]})
    async def check():
        settings = Settings.model_construct(mistral_api_key=SecretStr("cle-factice"), mistral_chat_model="modele-factice")
        client = MistralClient(settings, transport=httpx.MockTransport(handle))
        try:
            return await ToolCallingOpponent(MistralLLMAdapter(client)).choose(context(record))
        finally:
            await client.aclose()
    before = asdict(record)
    choice = asyncio.run(check())
    assert (choice.slot, choice.source) == (1, "llm")
    assert len(payloads) == 2
    assert "Choix privé" not in json.dumps(payloads)
    assert asdict(record) == before
