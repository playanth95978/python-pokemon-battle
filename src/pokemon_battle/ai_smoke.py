"""Scénario local de l'agent : python -m pokemon_battle.ai_smoke --help."""

import argparse
import asyncio
from dataclasses import asdict
from datetime import datetime, timezone
from fractions import Fraction
import json
import logging
import math
from pathlib import Path
from random import Random
import sys
from uuid import UUID

from .application.ai.generation import Completion, ToolCall
from .application.ai.opponent import CompletionClient, ToolCallingOpponent
from .application.ai.scenarios import SCENARIOS
from .application.ai.tools_context import ToolsContext
from .application.battle_repository import StoredBattle
from .core.config import Settings
from .domain import potion_healing
from .engine import BattleEngine, PotionUsed
from .mistral.client import MistralClient
from .mistral.llm_adapter import MistralLLMAdapter
from .types import effectiveness

logger = logging.getLogger("pokemon_battle.ai_smoke")


def scenario(name: str = "pikachu_vs_ground") -> StoredBattle:
    return SCENARIOS[name].create()


class SimulatedClient:
    """Simulation explicite pour vérifier le scénario sans réseau ni configuration."""

    async def complete(self, messages, **kwargs) -> Completion:
        if not any(message.role == "tool" for message in messages):
            return Completion(None, {}, tuple(ToolCall(f"sim-{index}", name, "{}") for index, name in enumerate((
                "inspect_battle", "list_legal_moves", "evaluate_matchups", "estimate_damage", "estimate_healing",
                "estimate_incoming_damage",
            ))))
        results = {message.name: json.loads(message.content) for message in messages if message.role == "tool"}
        if not results["estimate_damage"]["estimates"]:
            if results["estimate_healing"]["estimate_healing"]["available"]:
                return Completion(None, {}, (ToolCall("sim-potion", "select_potion", "{}"),))
            raise ValueError("Aucune action jouable dans la simulation")
        estimates = results["estimate_damage"]["estimates"]
        incoming = results["estimate_incoming_damage"]
        # Stratégie de référence : KO garanti avant la riposte d'abord, puis potion si elle écarte un KO probable.
        finishing = [item for item in estimates if item["name"] in incoming["attack_ko_before_riposte"]]
        risk_now, risk_after = incoming["max_ko_probability_now"], incoming["max_ko_probability_after_potion"]
        if (not finishing and risk_now is not None and risk_now >= 0.5
                and risk_after is not None and risk_after < risk_now):
            return Completion(None, {}, (ToolCall("sim-potion", "select_potion", "{}"),))
        move = max(finishing or estimates, key=lambda item: (item["expected_damage"], -item["attack_slot"]))
        return Completion(None, {}, (ToolCall("sim-select", "select_attack", json.dumps({"attack_slot": move["attack_slot"]})),))


async def run_scenario(client: CompletionClient, *, mode: str, model: str, timeout: float,
                       seed: int = 42, scenario_name: str = "pikachu_vs_ground") -> dict:
    definition = SCENARIOS[scenario_name]
    record = scenario(scenario_name)
    before = asdict(record.battle)
    context = ToolsContext.from_record(record, "agent", expected_turn=0)
    logger.info("Scénario=%s : %s. Slots attendus=%s", scenario_name, definition.description, definition.expected_slots)
    logger.info("Mode=%s modèle=%s délai_global=%ss", mode, model, timeout)
    decision = await ToolCallingOpponent(client, timeout_seconds=timeout).choose(context)
    move = next((move for move in context.legal_moves if move.attack_slot == decision.attack_slot), None)
    potion = decision.action_type == "potion"
    checks = {
        "legal_move": potion or move is not None,
        "avoids_immunity": potion or (move is not None and effectiveness(move.type, context.view.opponent.types) > 0),
        "expected_action": decision.action_type == definition.expected_action,
        "expected_slot": (potion and definition.expected_action == "potion") or decision.attack_slot in definition.expected_slots,
        "llm_selected": decision.source == "llm",
        "battle_unchanged_during_decision": asdict(record.battle) == before,
    }
    logger.info("Décision : action=%s attack_slot=%s attaque=%s source=%s repli=%s", decision.action_type,
                decision.attack_slot, move.name if move else "aucune", decision.source, decision.fallback_reason)
    # Le choix du joueur n'entre qu'ici, après la décision de l'agent.
    events = BattleEngine(Random(seed)).play_turn(record.battle, 0, decision.action())
    if definition.expected_action == "potion":
        healing = next((event for event in events if isinstance(event, PotionUsed) and event.actor == "agent"), None)
        hp_before = before["second"]["hp"]
        healed = potion_healing(hp_before, record.battle.second.species.stats.hp)
        checks["healing_applied"] = healing is not None and healing.healed == healed and healing.hp_remaining == hp_before + healed
        checks["potion_consumed_once"] = (healing is not None and healing.potions_remaining == before["second"]["potions"] - 1
                                          and record.battle.second.potions == before["second"]["potions"] - 1)
        checks["healed_before_attack"] = bool(events) and events[0] is healing
        checks["survives_turn"] = record.battle.second.hp > 0
    if definition.expected_outcome == "opponent_ko":
        checks["expected_outcome"] = record.battle.winner == record.battle.second.id
    elif definition.expected_outcome == "agent_survives":
        checks["expected_outcome"] = record.battle.second.hp > 0
    passed = all(checks.values())
    logger.info("Critères : %s", checks)
    logger.info("Tour résolu : %s=%s PV, %s=%s PV", record.battle.second.species.name, record.battle.second.hp,
                record.battle.first.species.name, record.battle.first.hp)
    metrics = asdict(context.metrics)
    metrics["model_time_ms"] = round(metrics["model_time_ms"], 3)
    metrics["usage_complete"] = context.metrics.complete_usage_reports == context.metrics.model_requests
    logger.info("Métriques : durée=%sms requêtes=%s outils=%s erreurs_outils=%s tokens=%s",
                metrics["elapsed_ms"], metrics["model_requests"], metrics["tool_calls_executed"],
                metrics["tool_errors"], metrics["tokens"] or "non communiqués")
    return {
        "schema_version": 2, "scenario": scenario_name, "mode": mode, "model": model,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(), "seed": seed,
        "passed": passed, "provider_responded": mode == "mistral" and metrics["model_responses"] > 0,
        "agent_checks_passed": mode == "mistral" and passed,
        "checks": checks, "decision": asdict(decision),
        "selected_attack": move.name if move else None, "metrics": metrics,
        "observations": context.observations,
        "turn": {"number": record.battle.turn, "winner": record.battle.winner,
                 "fighters": [{"id": fighter.id, "species": fighter.species.name, "hp": fighter.hp}
                              for fighter in (record.battle.first, record.battle.second)]},
        "events": [{"type": type(event).__name__, **asdict(event)} for event in events],
    }


def _selected_slots(runs: list[dict]) -> dict[str, int]:
    # Une potion n'a pas de slot : elle est comptée sous sa propre clé.
    labels = ["potion" if run["decision"].get("action_type") == "potion" else str(run["decision"]["attack_slot"])
              for run in runs]
    return {label: labels.count(label) for label in sorted(set(labels))}


def summarize(runs: list[dict]) -> dict:
    def rates(items):
        count = len(items)
        llm = [run for run in items if run["decision"]["source"] == "llm"]
        return {
            "runs": count, "passed": sum(run["passed"] for run in items),
            "pass_rate": sum(run["passed"] for run in items) / count,
            "fallback_rate": sum(run["decision"]["source"] == "local" for run in items) / count,
            "provider_response_rate": sum(run["provider_responded"] for run in items) / count,
            "llm_decision_rate": len(llm) / count,
            "strategy_success_among_llm": sum(run["checks"]["expected_slot"] for run in llm) / len(llm) if llm else None,
            "mean_elapsed_ms": round(sum(run["metrics"]["elapsed_ms"] for run in items) / count, 3),
            "selected_slots": _selected_slots(items),
        }
    tokens = {}
    for run in runs:
        for name, value in run["metrics"]["tokens"].items():
            tokens[name] = tokens.get(name, 0) + value
    return {**rates(runs),
            "model_requests": sum(run["metrics"]["model_requests"] for run in runs),
            "tool_calls_executed": sum(run["metrics"]["tool_calls_executed"] for run in runs),
            "tool_errors": sum(run["metrics"]["tool_errors"] for run in runs),
            "tokens": tokens, "usage_complete": all(run["metrics"]["usage_complete"] for run in runs),
            "per_scenario": {name: rates([run for run in runs if run["scenario"] == name])
                             for name in dict.fromkeys(run["scenario"] for run in runs)}}


async def run_suite(client: CompletionClient, *, mode: str, model: str, timeout: float,
                    scenarios: list[str], repeat: int, seed: int) -> dict:
    runs = []
    for name in scenarios:
        for index in range(repeat):
            logger.info("Évaluation scénario=%s répétition=%s/%s", name, index + 1, repeat)
            report = await run_scenario(client, mode=mode, model=model, timeout=timeout, seed=seed, scenario_name=name)
            report["repetition"] = index + 1
            runs.append(report)
    summary = summarize(runs)
    logger.info("Bilan : %s/%s réussites, repli=%s", summary["passed"], summary["runs"], summary["fallback_rate"])
    return {"schema_version": 2, "mode": mode, "model": model, "passed": all(run["passed"] for run in runs),
            "summary": summary, "runs": runs}


def _json_default(value):
    if isinstance(value, Fraction):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"Type JSON non pris en charge : {type(value).__name__}")


def _timeout(value: str) -> float:
    timeout = float(value)
    if not math.isfinite(timeout) or timeout <= 0:
        raise argparse.ArgumentTypeError("Le délai doit être positif et fini")
    return timeout


def _repeat(value: str) -> int:
    repeat = int(value)
    if repeat < 1:
        raise argparse.ArgumentTypeError("Le nombre de répétitions doit être positif")
    return repeat


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Test local de l'agent Mistral : outils, décision et métriques")
    parser.add_argument("--dry-run", action="store_true", help="Simulation SANS appel Mistral, explicitement marquée dans le rapport")
    parser.add_argument("--model", help="Modèle Mistral ; sinon MISTRAL_CHAT_MODEL")
    parser.add_argument("--timeout", type=_timeout, default=30, help="Délai global de décision en secondes (30 par défaut pour ce test)")
    parser.add_argument("--seed", type=int, default=42, help="Graine du moteur uniquement, pas du LLM")
    parser.add_argument("--output", type=Path, help="Enregistrer le rapport JSON à cet emplacement")
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--scenario", choices=list(SCENARIOS), default="pikachu_vs_ground", help="Scénario à exécuter")
    selection.add_argument("--suite", action="store_true", help="Exécuter tous les scénarios")
    parser.add_argument("--repeat", type=_repeat, default=1, help="Répétitions indépendantes par scénario")
    args = parser.parse_args(argv)
    # Les bibliothèques HTTP ne journalisent pas leurs requêtes dans cette démonstration.
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s | %(message)s")
    logging.getLogger("pokemon_battle").setLevel(logging.INFO)

    async def execute():
        async def evaluate(client, mode, model):
            if args.suite or args.repeat > 1:
                return await run_suite(client, mode=mode, model=model, timeout=args.timeout,
                                       scenarios=list(SCENARIOS) if args.suite else [args.scenario], repeat=args.repeat, seed=args.seed)
            return await run_scenario(client, mode=mode, model=model, timeout=args.timeout,
                                      seed=args.seed, scenario_name=args.scenario)
        if args.dry_run:
            return await evaluate(SimulatedClient(), "simulation", "simulation-sans-llm")
        configured = Settings()
        if not configured.mistral_api_key.get_secret_value() or configured.mistral_api_key.get_secret_value() == "remplacer_par_votre_cle":
            print("Configurer MISTRAL_API_KEY côté backend avant le test réel, ou utiliser --dry-run.", file=sys.stderr)
            return None
        client = MistralClient(configured)
        try:
            adapter = MistralLLMAdapter(client, model=args.model)
            return await evaluate(adapter, "mistral", adapter.model)
        finally:
            await client.aclose()

    report = asyncio.run(execute())
    if report is None:
        return 2
    serialized = json.dumps(report, ensure_ascii=False, indent=2, default=_json_default)
    print(serialized)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized + "\n", encoding="utf-8")
        logger.info("Rapport enregistré : %s", args.output)
    # Un repli local ne doit pas passer pour un test réussi du fournisseur réel.
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
