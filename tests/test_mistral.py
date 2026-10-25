"""Tests du transport et des échanges d'outils sans clé ni appel réseau réel."""

import asyncio
import json
from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr

from pokemon_battle.application.ai.generation import Message, ToolCall
from pokemon_battle.core.config import PROJECT_ROOT, Settings
from pokemon_battle.core.exceptions import MissingCredentials, MistralTimeout, MistralUnavailable
from pokemon_battle.mistral.client import MistralClient
from pokemon_battle.mistral.llm_adapter import MistralLLMAdapter


def settings(key="cle-factice-pour-tests"):
    # model_construct ne consulte ni l'environnement ni le fichier .env de la machine.
    return Settings.model_construct(mistral_api_key=SecretStr(key), mistral_chat_model="modele-factice")


def response(message, usage=None):
    return {"choices": [{"message": message}], "usage": usage}


def call(identifier="appel-1", name="list_legal_moves", arguments="{}"):
    return {"id": identifier, "type": "function", "function": {"name": name, "arguments": arguments}}


def testLaConfigurationViseLeFichierEnvALaRacine():
    """Le chemin se déduit du fichier source sans ouvrir de fichier de secrets."""
    assert PROJECT_ROOT == Path(__file__).resolve().parents[1]
    assert Settings.model_config["env_file"] == PROJECT_ROOT / ".env"


def testUnAppelOutilPuisSonResultatConserventLeursIdentifiants():
    """Un aller-retour complet conserve la réponse assistant et l'identifiant de chaque outil."""
    payloads = []
    schema = {"type": "function", "function": {"name": "list_legal_moves", "description": "Attaques jouables", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}}

    def handle(request):
        assert request.url == "https://api.mistral.ai/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer cle-factice-pour-tests"
        payloads.append(json.loads(request.content))
        if len(payloads) == 1:
            return httpx.Response(200, json=response({"content": None, "tool_calls": [call()]}, {"total_tokens": 37}))
        return httpx.Response(200, json=response({"content": "Je choisis Éclair."}, {"total_tokens": 51}))

    async def check():
        client = MistralClient(settings(), transport=httpx.MockTransport(handle))
        try:
            adapter = MistralLLMAdapter(client)
            messages = [Message("user", "Choisis une attaque.")]
            first = await adapter.complete(messages, tools=[schema], tool_choice="any")
            assert first.text is None
            assert first.tool_calls == (ToolCall("appel-1", "list_legal_moves", "{}"),)
            assert first.usage == {"total_tokens": 37}
            messages.extend([
                Message("assistant", first.text, tool_calls=first.tool_calls),
                Message("tool", '{"slots": [0, 1]}', tool_call_id="appel-1", name="list_legal_moves"),
            ])
            final = await adapter.complete(messages, tools=[schema])
            assert final.text == "Je choisis Éclair."
            assert final.tool_calls == ()
            assert final.usage == {"total_tokens": 51}
        finally:
            await client.aclose()
        assert client.http.is_closed

    asyncio.run(check())
    assert payloads[0]["tools"] == [schema]
    assert payloads[0]["tool_choice"] == "any"
    assert payloads[0]["messages"] == [{"role": "user", "content": "Choisis une attaque."}]
    assert "prompt_cache_key" not in payloads[0]
    assert payloads[1]["messages"][1] == {"role": "assistant", "content": None, "tool_calls": [call()]}
    assert payloads[1]["messages"][2] == {"role": "tool", "content": '{"slots": [0, 1]}', "tool_call_id": "appel-1", "name": "list_legal_moves"}


@pytest.mark.parametrize("content, expected", [
    ("Une réponse", "Une réponse"),
    ([{"type": "text", "text": "Bon"}, {"type": "text", "text": "jour"}], "Bonjour"),
])
def testLesReponsesTextuellesRestentCompatibles(content, expected):
    """L'ajout des outils conserve les réponses textuelles simples et segmentées."""
    def handle(request):
        assert "tools" not in json.loads(request.content)
        return httpx.Response(200, json=response({"content": content}))

    async def check():
        client = MistralClient(settings(), transport=httpx.MockTransport(handle))
        try:
            result = await MistralLLMAdapter(client).complete([Message("user", "Bonjour")])
            assert result.text == expected
            assert result.usage == {}
            assert result.tool_calls == ()
        finally:
            await client.aclose()
    asyncio.run(check())


def testPlusieursAppelsEtDesArgumentsObjetSontConserves():
    """Les outils parallèles gardent chacun leur identifiant et leurs arguments JSON."""
    async def check():
        result = response({"content": None, "tool_calls": [call("a", "inspect_battle"), call("b", "select_attack", {"attack_slot": 1})]})
        client = MistralClient(settings(), transport=httpx.MockTransport(lambda request: httpx.Response(200, json=result)))
        try:
            completion = await MistralLLMAdapter(client).complete([])
            assert [(item.id, item.name, json.loads(item.arguments)) for item in completion.tool_calls] == [
                ("a", "inspect_battle", {}), ("b", "select_attack", {"attack_slot": 1}),
            ]
        finally:
            await client.aclose()
    asyncio.run(check())


@pytest.mark.parametrize("result", [
    {}, {"choices": []}, response({"content": None}), response({"content": 42}),
    response({"content": "texte", "tool_calls": "invalide"}),
    response({"content": "texte", "tool_calls": {}}),
    response({"content": None, "tool_calls": [call(), call()]}),
    response({"content": None, "tool_calls": [{"id": "a", "type": "function", "function": {}}]}),
    response({"content": None, "tool_calls": [call(arguments=17)]}),
    response({"content": "texte"}, usage=[1]),
])
def testUneReponseMalFormeeProduitUneErreurApplicative(result):
    """Une erreur de contrat fournisseur ne doit pas fuir sous forme de KeyError ou TypeError."""
    async def check():
        client = MistralClient(settings(), transport=httpx.MockTransport(lambda request: httpx.Response(200, json=result)))
        try:
            with pytest.raises(MistralUnavailable):
                await MistralLLMAdapter(client).complete([])
        finally:
            await client.aclose()
    asyncio.run(check())


@pytest.mark.parametrize("status, content", [(401, b'{}'), (429, b'{}'), (503, b'{}'), (200, b'not-json'), (200, b'[]')])
def testLesErreursHttpEtJsonSontTraduites(status, content):
    """Le transport ne révèle ni réponse fournisseur brute ni en-tête d'authentification."""
    async def check():
        client = MistralClient(settings(), transport=httpx.MockTransport(lambda request: httpx.Response(status, content=content)))
        try:
            with pytest.raises(MistralUnavailable):
                await client.post("chat/completions", {})
        finally:
            await client.aclose()
    asyncio.run(check())


def testUnTimeoutEstDistingueDuneErreurHttp():
    """Le service appelant peut déclencher sa stratégie de secours sur un délai dépassé."""
    def handle(request):
        raise httpx.ReadTimeout("délai simulé", request=request)
    async def check():
        client = MistralClient(settings(), transport=httpx.MockTransport(handle))
        try:
            with pytest.raises(MistralTimeout):
                await client.post("chat/completions", {})
        finally:
            await client.aclose()
    asyncio.run(check())


@pytest.mark.parametrize("key", ["", "remplacer_par_votre_cle"])
def testUneCleAbsenteNeDeclencheAucuneRequete(key):
    """L'erreur de configuration est détectée avant l'appel au transport."""
    def handle(request):
        pytest.fail("Le transport ne doit pas être appelé sans clé.")
    async def check():
        client = MistralClient(settings(key), transport=httpx.MockTransport(handle))
        try:
            with pytest.raises(MissingCredentials):
                await client.post("chat/completions", {})
        finally:
            await client.aclose()
    asyncio.run(check())
