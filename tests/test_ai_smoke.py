"""Scénario lançable localement, testé sans consommer l'API Mistral."""

import asyncio
import json

import httpx
import pytest
from pydantic import SecretStr

from pokemon_battle import ai_smoke
from pokemon_battle.application.ai.generation import Completion, ToolCall
from pokemon_battle.application.ai.telemetry import DecisionMetrics
from pokemon_battle.core.config import Settings
from pokemon_battle.core.exceptions import MistralUnavailable
from pokemon_battle.mistral.client import MistralClient


def testLaSimulationExecuteLesQuatreOutilsEtUnTourSansChargerLaConfiguration(tmp_path, monkeypatch, capsys):
    """Le mode sans réseau ne doit jamais lire la configuration réelle et reste identifié comme simulation."""
    def forbidden():
        pytest.fail("Le mode simulation ne doit pas charger Settings")
    monkeypatch.setattr(ai_smoke, "Settings", forbidden)
    path = tmp_path / "report.json"
    assert ai_smoke.main(["--dry-run", "--output", str(path)]) == 0
    report = json.loads(path.read_text(encoding="utf-8"))
    assert report["mode"] == "simulation"
    assert report["real_agent_verified"] is False
    assert report["selected_attack"] == "Charge"
    assert report["metrics"]["model_requests"] == 2
    assert report["metrics"]["tool_calls_executed"] == 4
    assert report["metrics"]["tokens"] == {}
    assert report["metrics"]["usage_complete"] is False
    assert report["turn"] == {"number": 1, "pikachu_hp": 86, "sandshrew_hp": 122, "winner": None}
    assert all(report["checks"].values())
    assert json.loads(capsys.readouterr().out)["passed"] is True


def testLesMetriquesCumulentLesTokensCommuniquesSansInventerLesValeursAbsentes():
    """Les nombres partiels sont conservés et les booléens ou compteurs négatifs ne sont pas comptés."""
    metrics = DecisionMetrics()
    metrics.add_usage({"prompt_tokens": 10, "completion_tokens": 3, "total_tokens": 13})
    metrics.add_usage({"total_tokens": 7})
    metrics.add_usage({"total_tokens": True, "prompt_tokens": -1})
    assert metrics.tokens == {"prompt_tokens": 10, "completion_tokens": 3, "total_tokens": 20}
    assert metrics.usage_reports == 2
    assert metrics.complete_usage_reports == 1


def testLeRapportDistingueUneMauvaiseDecisionDuLlmDuneReussite():
    """Sélectionner Éclair contre Sol reste une décision légale mais échoue au critère stratégique."""
    class BadDecisionClient:
        async def complete(self, *args, **kwargs):
            return Completion(None, {"prompt_tokens": 18, "completion_tokens": 4, "total_tokens": 22},
                              (ToolCall("select001", "select_attack", '{"slot":0}'),))
    report = asyncio.run(ai_smoke.run_scenario(BadDecisionClient(), mode="mistral", model="fake", timeout=1))
    assert report["checks"]["legal_move"] is True
    assert report["checks"]["avoids_immunity"] is False
    assert report["passed"] is False
    assert report["real_agent_verified"] is False
    assert report["metrics"]["tokens"]["total_tokens"] == 22
    assert report["metrics"]["usage_complete"] is True
    assert report["metrics"]["model_time_ms"] >= 0
    assert report["metrics"]["elapsed_ms"] >= 0


def testUnRepliLocalNeComptePasCommeUnTestReussiDuFournisseur():
    """Une panne fournisseur peut produire un bon choix de secours sans valider l'intégration réelle."""
    class FailedClient:
        async def complete(self, *args, **kwargs):
            raise MistralUnavailable()
    report = asyncio.run(ai_smoke.run_scenario(FailedClient(), mode="mistral", model="fake", timeout=1))
    assert report["selected_attack"] == "Charge"
    assert report["decision"]["fallback_reason"] == "unavailable"
    assert report["passed"] is False
    assert report["metrics"]["model_requests"] == 1
    assert report["metrics"]["model_responses"] == 0
    assert report["metrics"]["trace"][-1]["event"] == "fallback"


def testUneCleAbsenteRetourneUnCodeDeConfigurationSansCreerDeClient(monkeypatch, capsys):
    """Une clé manquante est signalée avant tout appel fournisseur, sans dévoiler de configuration."""
    monkeypatch.setattr(ai_smoke, "Settings", lambda: Settings.model_construct(mistral_api_key=SecretStr("")))
    def forbidden(*args, **kwargs):
        pytest.fail("Aucun client ne doit être créé sans clé")
    monkeypatch.setattr(ai_smoke, "MistralClient", forbidden)
    assert ai_smoke.main([]) == 2
    assert "MISTRAL_API_KEY" in capsys.readouterr().err


def testLeModeReelBrancheLAdaptateurEtFermeLeClientAvecUnTransportSimule(monkeypatch, tmp_path, capsys):
    """Le chemin CLI réel est testé sans requête externe et ne divulgue pas la clé factice."""
    key = "cle-test-a-ne-pas-journaliser"
    monkeypatch.setattr(ai_smoke, "Settings", lambda: Settings.model_construct(mistral_api_key=SecretStr(key)))
    clients = []
    def handle(request):
        payload = json.loads(request.content)
        assert payload["model"] == "modele-de-test"
        return httpx.Response(200, json={"usage": {"prompt_tokens": 8, "completion_tokens": 5, "total_tokens": 13}, "choices": [{"message": {"content": None, "tool_calls": [
            {"id": "select001", "type": "function", "function": {"name": "select_attack", "arguments": '{"slot":1}'}},
        ]}}]})
    def factory(settings):
        client = MistralClient(settings, transport=httpx.MockTransport(handle))
        clients.append(client)
        return client
    monkeypatch.setattr(ai_smoke, "MistralClient", factory)
    path = tmp_path / "real-path.json"
    assert ai_smoke.main(["--model", "modele-de-test", "--output", str(path)]) == 0
    report = json.loads(path.read_text(encoding="utf-8"))
    assert report["mode"] == "mistral"
    assert report["real_agent_verified"] is True
    assert report["metrics"]["tokens"] == {"prompt_tokens": 8, "completion_tokens": 5, "total_tokens": 13}
    assert clients[0].http.is_closed
    captured = capsys.readouterr()
    assert key not in captured.out + captured.err + path.read_text(encoding="utf-8")


@pytest.mark.parametrize("value", ["0", "-1", "nan", "inf"])
def testLeDelaiDoitEtreBorneEtPositif(value):
    """Les paramètres CLI ne doivent pas désactiver accidentellement le budget global."""
    with pytest.raises(SystemExit) as error:
        ai_smoke.main(["--dry-run", "--timeout", value])
    assert error.value.code == 2
