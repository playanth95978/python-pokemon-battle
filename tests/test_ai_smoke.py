"""Scénario lançable localement, testé sans consommer l'API Mistral."""

import asyncio
import json
import os

import httpx
import pytest
from pydantic import SecretStr

from pokemon_battle import ai_smoke
from pokemon_battle.application.ai.generation import Completion, ToolCall
from pokemon_battle.application.ai.telemetry import DecisionMetrics
from pokemon_battle.application.ai.scenarios import SCENARIOS
from pokemon_battle.application.ai.tools import execute_tool
from pokemon_battle.application.ai.tools_context import ToolsContext
from pokemon_battle.core.config import Settings
from pokemon_battle.core.exceptions import MistralUnavailable
from pokemon_battle.mistral.client import MistralClient


def testLaSimulationExecuteLesOutilsEtUnTourSansChargerLaConfiguration(tmp_path, monkeypatch, capsys):
    """Le mode sans réseau ne doit jamais lire la configuration réelle et reste identifié comme simulation."""
    def forbidden():
        pytest.fail("Le mode simulation ne doit pas charger Settings")
    monkeypatch.setattr(ai_smoke, "Settings", forbidden)
    path = tmp_path / "report.json"
    assert ai_smoke.main(["--dry-run", "--output", str(path)]) == 0
    report = json.loads(path.read_text(encoding="utf-8"))
    assert report["mode"] == "simulation"
    assert report["provider_responded"] is False
    assert report["agent_checks_passed"] is False
    assert report["selected_attack"] == "Charge"
    assert report["metrics"]["model_requests"] == 1
    assert report["metrics"]["tool_calls_executed"] == 1
    assert report["metrics"]["precomputed_tools"] == 7
    assert report["metrics"]["tokens"] == {}
    assert report["metrics"]["usage_complete"] is False
    assert report["turn"] == {"number": 1, "winner": None, "fighters": [
        {"id": "player", "species": "Sabelette", "hp": 122}, {"id": "agent", "species": "Pikachu", "hp": 86},
    ]}
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
                              (ToolCall("select001", "select_attack", '{"attack_slot":0}'),))
    report = asyncio.run(ai_smoke.run_scenario(BadDecisionClient(), mode="mistral", model="fake", timeout=1))
    assert report["checks"]["legal_move"] is True
    assert report["checks"]["avoids_immunity"] is False
    assert report["passed"] is False
    assert report["provider_responded"] is True
    assert report["agent_checks_passed"] is False
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
        assert payload["max_tokens"] == 150
        assert {tool["function"]["name"] for tool in payload["tools"]} == {"select_attack", "select_potion"}
        return httpx.Response(200, json={"usage": {"prompt_tokens": 8, "completion_tokens": 5, "total_tokens": 13}, "choices": [{"message": {"content": None, "tool_calls": [
            {"id": "select001", "type": "function", "function": {"name": "select_attack", "arguments": '{"attack_slot":1}'}},
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
    assert report["provider_responded"] is True
    assert report["agent_checks_passed"] is True
    assert report["metrics"]["tokens"] == {"prompt_tokens": 8, "completion_tokens": 5, "total_tokens": 13}
    assert clients[0].http.is_closed
    captured = capsys.readouterr()
    assert key not in captured.out + captured.err + path.read_text(encoding="utf-8")


@pytest.mark.skipif(os.environ.get("MISTRAL_INTEGRATION") != "1",
                    reason="Appel Mistral réel : définir MISTRAL_INTEGRATION=1 et MISTRAL_API_KEY")
def testLeVraiModeleConsulteEstimateHealingEtLeRapportJsonEnGardeLeResultat(monkeypatch, tmp_path, capsys):
    """Intégration réelle : Mistral appelle estimate_healing sur un Pikachu blessé, sans potion consommée."""
    def injured(name):
        record = SCENARIOS[name].create()
        record.battle.second.hp = 50
        return record
    monkeypatch.setattr(ai_smoke, "scenario", injured)
    path = tmp_path / "healing-real.json"

    # Le choix d'attaque du modèle n'est pas déterministe : seul le code 2 (configuration absente) est exclu.
    assert ai_smoke.main(["--exploratory-tools", "--output", str(path)]) in (0, 1)

    report = json.loads(path.read_text(encoding="utf-8"))
    assert report["mode"] == "mistral"
    assert report["provider_responded"] is True
    assert report["decision"]["source"] == "llm"
    assert report["observations"]["estimate_healing"]["estimate_healing"] == {
        "available": True, "healed": 20, "hp_after_healing": 70, "potions_remaining_after_use": 1,
    }
    assert report["metrics"]["tool_errors"] == 0
    assert report["checks"]["battle_unchanged_during_decision"] is True
    capsys.readouterr()


def testUnePotionChoisieEstJoueeParLeSmokeEtCompteeDansLeBilan(monkeypatch):
    """Le smoke résout la potion via le moteur et le bilan ne confond pas potion et slot d'attaque."""
    def injured(name):
        record = SCENARIOS[name].create()
        record.battle.second.hp = 50
        return record
    monkeypatch.setattr(ai_smoke, "scenario", injured)
    class PotionClient:
        async def complete(self, *args, **kwargs):
            return Completion(None, {}, (ToolCall("potion001", "select_potion", "{}"),))
    report = asyncio.run(ai_smoke.run_scenario(PotionClient(), mode="mistral", model="fake", timeout=1))
    assert report["decision"]["action_type"] == "potion"
    assert report["selected_attack"] is None
    assert report["checks"]["legal_move"] is True
    assert report["checks"]["expected_slot"] is False
    assert [event for event in report["events"] if event["type"] == "PotionUsed"][0]["healed"] == 20
    assert ai_smoke.summarize([report])["selected_slots"] == {"potion": 1}


def _fast_opponent(monkeypatch, name):
    """Variante du scénario où l'adversaire agit avant l'agent."""
    from dataclasses import replace as replace_dataclass
    from pokemon_battle.domain import Species
    def faster(scenario_name):
        record = SCENARIOS[scenario_name].create()
        player = record.battle.first
        stats = replace_dataclass(player.species.stats, speed=200)
        player.species = Species(player.species.name, player.species.types, stats, player.species.attacks)
        return record
    monkeypatch.setattr(ai_smoke, "scenario", faster)


def testLaSimulationTientCompteDeLOrdreAvantDeViserUnKo(monkeypatch):
    """Adversaire plus rapide : Éclair ne passerait pas avant Griffe, la simulation se soigne."""
    _fast_opponent(monkeypatch, "finish_over_heal")
    report = asyncio.run(ai_smoke.run_scenario(ai_smoke.SimulatedClient(), mode="simulation", model="sim",
                                               timeout=1, scenario_name="finish_over_heal"))
    assert report["decision"]["action_type"] == "potion"
    assert report["observations"]["estimate_incoming_damage"]["turn_order"] == "opponent_attacks_first"


def testUneAttaqueQuiMeurtAvantDAgirEchoueSurLIssueAttendue(monkeypatch):
    """Attaquer quand l'adversaire frappe d'abord tue l'agent : le rapport ne peut pas être réussi."""
    _fast_opponent(monkeypatch, "finish_over_heal")
    class AttackClient:
        async def complete(self, *args, **kwargs):
            return Completion(None, {}, (ToolCall("attack001", "select_attack", '{"attack_slot":0}'),))
    report = asyncio.run(ai_smoke.run_scenario(AttackClient(), mode="mistral", model="fake", timeout=1,
                                               scenario_name="finish_over_heal"))
    assert report["turn"]["winner"] == "player"
    assert report["checks"]["expected_outcome"] is False
    assert report["passed"] is False


def testLeStockEstCompareAuStockInitialMoinsUn(monkeypatch):
    """Avec deux potions, une utilisation correcte laisse un stock de un et reste réussie."""
    def two_potions(name):
        record = SCENARIOS[name].create()
        record.battle.second.potions = 2
        return record
    monkeypatch.setattr(ai_smoke, "scenario", two_potions)
    report = asyncio.run(ai_smoke.run_scenario(ai_smoke.SimulatedClient(), mode="simulation", model="sim",
                                               timeout=1, scenario_name="heal_to_survive"))
    potion_event = next(event for event in report["events"] if event["type"] == "PotionUsed")
    assert potion_event["potions_remaining"] == 1
    assert report["checks"]["potion_consumed_once"] is True
    assert report["passed"] is True


@pytest.mark.parametrize("value", ["0", "-1", "nan", "inf"])
def testLeDelaiDoitEtreBorneEtPositif(value):
    """Les paramètres CLI ne doivent pas désactiver accidentellement le budget global."""
    with pytest.raises(SystemExit) as error:
        ai_smoke.main(["--dry-run", "--timeout", value])
    assert error.value.code == 2


@pytest.mark.parametrize("name, attack_slot, multiplier, label", [
    ("pikachu_vs_ground", 0, 0.0, "immune"),
    ("pikachu_vs_ground", 1, 1.0, "neutral"),
    ("water_weakness", 0, 2.0, "super_effective"),
    ("grass_resistance", 0, 0.5, "resisted"),
    ("double_weakness", 1, 4.0, "super_effective"),
])
def testLEfficaciteAssocieUnLibelleEtLeNomAuMultiplicateurMetier(name, attack_slot, multiplier, label):
    """Les explications lisibles et les identifiants de attack_slot doivent rester cohérents avec le calcul métier."""
    record = SCENARIOS[name].create()
    ctx = ToolsContext.from_record(record, "agent", 0)
    result = execute_tool(ctx, ToolCall("matchup01", "evaluate_matchups", "{}"))
    item = next(item for item in result["matchups"] if item["attack_slot"] == attack_slot)
    assert item["multiplier"] == multiplier
    assert item["effectiveness"] == label
    assert item["name"] == record.battle.second.species.attacks[attack_slot].name
    assert item["target_types"] == [kind.value for kind in record.battle.first.species.types]
    assert item["explanation"]


def testUneAttaqueImmuniseeResteSelectionnablePourNePasMasquerLesErreursDuModele():
    """La validation métier ne doit pas transformer un test stratégique en réussite forcée."""
    ctx = ToolsContext.from_record(SCENARIOS["pikachu_vs_ground"].create(), "agent", 0)
    assert execute_tool(ctx, ToolCall("select001", "select_attack", '{"attack_slot":0}')) == {"selected_slot": 0}
    assert ctx.decision.source == "llm"


def testLaSuiteRepeteSeptScenariosAvecDesActionsDifferentesSansReseau(monkeypatch, tmp_path, capsys):
    """Chaque répétition démarre un combat neuf ; les slots inversés et les PP épuisés changent le choix attendu."""
    def forbidden():
        pytest.fail("La simulation ne doit pas lire la configuration")
    monkeypatch.setattr(ai_smoke, "Settings", forbidden)
    path = tmp_path / "suite.json"
    assert ai_smoke.main(["--dry-run", "--suite", "--repeat", "2", "--output", str(path)]) == 0
    report = json.loads(path.read_text(encoding="utf-8"))
    assert report["schema_version"] == 2
    assert report["summary"]["runs"] == 20
    assert report["summary"]["passed"] == 20
    assert report["summary"]["fallback_rate"] == 0
    assert report["summary"]["tokens"] == {}
    assert report["summary"]["usage_complete"] is False
    assert report["summary"]["per_scenario"]["reversed_slots"]["selected_slots"] == {"0": 2}
    assert report["summary"]["per_scenario"]["exhausted_move"]["selected_slots"] == {"1": 2}
    assert [run["repetition"] for run in report["runs"]] == [1, 2] * 10
    assert report["summary"]["per_scenario"]["potion_only"]["selected_slots"] == {"potion": 2}
    assert all(not run["provider_responded"] and not run["agent_checks_passed"] for run in report["runs"])
    assert all(run["checks"]["battle_unchanged_during_decision"] for run in report["runs"])
    capsys.readouterr()


def testLeScenarioPotionVerifieLeSoinLeStockEtLaSurvieSansReseau(monkeypatch, tmp_path, capsys):
    """Une IA sans PP doit choisir sa dernière potion, se soigner avant le coup et ne rien muter pendant sa décision."""
    def forbidden():
        pytest.fail("Le mode simulation ne doit pas charger Settings")
    monkeypatch.setattr(ai_smoke, "Settings", forbidden)
    path = tmp_path / "potion.json"
    assert ai_smoke.main(["--dry-run", "--scenario", "potion_only", "--output", str(path)]) == 0
    report = json.loads(path.read_text(encoding="utf-8"))
    assert report["passed"] is True
    assert all(report["checks"].values())
    assert report["decision"]["action_type"] == "potion"
    assert report["decision"]["attack_slot"] is None
    assert report["observations"]["list_legal_moves"]["moves"] == []
    assert report["observations"]["estimate_healing"]["estimate_healing"] == {
        "available": True, "healed": 20, "hp_after_healing": 30, "potions_remaining_after_use": 0,
    }
    assert report["events"][0] == {"type": "PotionUsed", "turn": 1, "actor": "agent",
                                    "healed": 20, "hp_remaining": 30, "potions_remaining": 0}
    assert report["turn"]["fighters"][1]["hp"] == 8
    assert [event["actor"] for event in report["events"] if event["type"] == "AttackUsed"] == ["player"]
    capsys.readouterr()


def testUnePotionDeSecoursNeValidePasUnTestDuLlm():
    """La bonne action choisie localement ne doit pas compter comme une réussite de Mistral."""
    class FailingClient:
        async def complete(self, *args, **kwargs):
            raise MistralUnavailable()
    report = asyncio.run(ai_smoke.run_scenario(FailingClient(), mode="mistral", model="fake", timeout=1, scenario_name="potion_only"))
    assert report["decision"]["action_type"] == "potion"
    assert report["decision"]["source"] == "local"
    assert report["checks"]["healing_applied"] is True
    assert report["checks"]["llm_selected"] is False
    assert report["passed"] is False


def testLeBilanNAssimilePasLesReplisAuxBonnesDecisionsDuModele():
    """Le taux stratégique du modèle doit exclure les secours locaux sans cacher les échecs de la suite."""
    class WrongClient:
        async def complete(self, *args, **kwargs):
            return Completion(None, {}, (ToolCall("wrong0001", "select_attack", '{"attack_slot":0}'),))
    class FailingClient:
        async def complete(self, *args, **kwargs):
            raise MistralUnavailable()
    async def check():
        kwargs = {"mode": "mistral", "model": "fake", "timeout": 1}
        return [await ai_smoke.run_scenario(ai_smoke.SimulatedClient(), **kwargs),
                await ai_smoke.run_scenario(WrongClient(), **kwargs),
                await ai_smoke.run_scenario(FailingClient(), **kwargs)]
    summary = ai_smoke.summarize(asyncio.run(check()))
    assert summary["runs"] == 3
    assert summary["passed"] == 1
    assert summary["pass_rate"] == 1 / 3
    assert summary["fallback_rate"] == 1 / 3
    assert summary["strategy_success_among_llm"] == 0.5


@pytest.mark.parametrize("value", ["0", "-1"])
def testLeNombreDeRepetitionsDoitEtrePositif(value):
    """Une suite vide ne doit pas être considérée comme une réussite."""
    with pytest.raises(SystemExit) as error:
        ai_smoke.main(["--dry-run", "--repeat", value])
    assert error.value.code == 2


@pytest.mark.parametrize("exploratory,requests,tools,precomputed", [(False, 10, 10, 70), (True, 20, 70, 0)])
def testLesDixScenariosRestentJouablesDansLesDeuxModes(tmp_path, capsys, exploratory, requests, tools, precomputed):
    """La comparaison CLI conserve les dix choix attendus et distingue les lectures locales des appels du modèle."""
    path = tmp_path / "suite.json"
    args = ["--dry-run", "--suite", "--output", str(path)]
    if exploratory:
        args.append("--exploratory-tools")
    assert ai_smoke.main(args) == 0
    report = json.loads(path.read_text(encoding="utf-8"))
    assert report["summary"]["passed"] == 10
    assert report["summary"]["model_requests"] == requests
    assert report["summary"]["tool_calls_executed"] == tools
    assert report["summary"]["precomputed_tools"] == precomputed
    assert {run["decision_mode"] for run in report["runs"]} == {"exploratory" if exploratory else "precomputed"}
    capsys.readouterr()
