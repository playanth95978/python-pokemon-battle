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
from .application.ai.tools_context import ToolsContext
from .application.battle_repository import StoredBattle
from .core.config import Settings
from .domain import Attack, Category, Fighter, Species, Stats
from .engine import Battle, BattleEngine
from .mistral.client import MistralClient
from .mistral.llm_adapter import MistralLLMAdapter
from .types import Type, effectiveness

logger = logging.getLogger("pokemon_battle.ai_smoke")


def scenario() -> StoredBattle:
    """Éclair est légal mais inefficace sur Sabelette ; Charge est le choix attendu."""
    pikachu = Species("Pikachu", (Type.ELECTRIC,), Stats(110, 65, 54, 73, 62, 91), (
        Attack("Éclair", Type.ELECTRIC, 40, 100, 30, Category.SPECIAL),
        Attack("Charge", Type.NORMAL, 40, 100, 35),
    ))
    sandshrew = Species("Sabelette", (Type.GROUND,), Stats(135, 74, 86, 43, 55, 47), (
        Attack("Griffe", Type.NORMAL, 40, 100, 35),
    ))
    return StoredBattle(UUID("00000000-0000-0000-0000-000000000025"),
                        Battle(Fighter("player", sandshrew), Fighter("agent", pikachu)))


class SimulatedClient:
    """Simulation explicite pour vérifier le scénario sans réseau ni configuration."""

    async def complete(self, messages, **kwargs) -> Completion:
        if not any(message.role == "tool" for message in messages):
            return Completion(None, {}, tuple(ToolCall(f"sim-{index}", name, "{}") for index, name in enumerate((
                "inspect_battle", "list_legal_moves", "evaluate_matchups",
            ))))
        return Completion(None, {}, (ToolCall("sim-select", "select_attack", '{"slot":1}'),))


async def run_scenario(client: CompletionClient, *, mode: str, model: str, timeout: float,
                       seed: int = 42) -> dict:
    record = scenario()
    before = asdict(record.battle)
    context = ToolsContext.from_record(record, "agent", expected_turn=0)
    logger.info("Scénario : Pikachu contre Sabelette (Sol). Attendu : Charge, slot 1.")
    logger.info("Mode=%s modèle=%s délai_global=%ss", mode, model, timeout)
    decision = await ToolCallingOpponent(client, timeout_seconds=timeout).choose(context)
    move = next((move for move in context.legal_moves if move.slot == decision.slot), None)
    checks = {
        "legal_move": move is not None,
        "avoids_immunity": move is not None and effectiveness(move.type, context.view.opponent.types) > 0,
        "expected_slot": decision.slot == 1,
        "llm_selected": decision.source == "llm",
        "battle_unchanged_during_decision": asdict(record.battle) == before,
    }
    passed = all(checks.values())
    logger.info("Décision : slot=%s attaque=%s source=%s repli=%s", decision.slot,
                move.name if move else "invalide", decision.source, decision.fallback_reason)
    logger.info("Critères : %s", checks)
    # Le choix du joueur n'entre qu'ici, après la décision de l'agent.
    events = BattleEngine(Random(seed)).play_turn(record.battle, 0, decision.slot)
    logger.info("Tour résolu : Pikachu=%s PV, Sabelette=%s PV", record.battle.second.hp, record.battle.first.hp)
    metrics = asdict(context.metrics)
    metrics["model_time_ms"] = round(metrics["model_time_ms"], 3)
    metrics["usage_complete"] = context.metrics.complete_usage_reports == context.metrics.model_requests
    logger.info("Métriques : durée=%sms requêtes=%s outils=%s erreurs_outils=%s tokens=%s",
                metrics["elapsed_ms"], metrics["model_requests"], metrics["tool_calls_executed"],
                metrics["tool_errors"], metrics["tokens"] or "non communiqués")
    return {
        "scenario": "pikachu_vs_ground", "mode": mode, "model": model,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(), "seed": seed,
        "passed": passed, "real_agent_verified": mode == "mistral" and passed,
        "checks": checks, "decision": asdict(decision),
        "selected_attack": move.name if move else None, "metrics": metrics,
        "observations": context.observations,
        "turn": {"number": record.battle.turn, "pikachu_hp": record.battle.second.hp,
                 "sandshrew_hp": record.battle.first.hp, "winner": record.battle.winner},
        "events": [{"type": type(event).__name__, **asdict(event)} for event in events],
    }


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Test local de l'agent Mistral : outils, décision et métriques")
    parser.add_argument("--dry-run", action="store_true", help="Simulation SANS appel Mistral, explicitement marquée dans le rapport")
    parser.add_argument("--model", help="Modèle Mistral ; sinon MISTRAL_CHAT_MODEL")
    parser.add_argument("--timeout", type=_timeout, default=30, help="Délai global de décision en secondes (30 par défaut pour ce test)")
    parser.add_argument("--seed", type=int, default=42, help="Graine du moteur uniquement, pas du LLM")
    parser.add_argument("--output", type=Path, help="Enregistrer le rapport JSON à cet emplacement")
    args = parser.parse_args(argv)
    # Les bibliothèques HTTP ne journalisent pas leurs requêtes dans cette démonstration.
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s | %(message)s")
    logging.getLogger("pokemon_battle").setLevel(logging.INFO)

    async def execute():
        if args.dry_run:
            return await run_scenario(SimulatedClient(), mode="simulation", model="simulation-sans-llm",
                                      timeout=args.timeout, seed=args.seed)
        configured = Settings()
        if not configured.mistral_api_key.get_secret_value() or configured.mistral_api_key.get_secret_value() == "remplacer_par_votre_cle":
            print("Configurer MISTRAL_API_KEY côté backend avant le test réel, ou utiliser --dry-run.", file=sys.stderr)
            return None
        client = MistralClient(configured)
        try:
            adapter = MistralLLMAdapter(client, model=args.model)
            return await run_scenario(adapter, mode="mistral", model=adapter.model,
                                      timeout=args.timeout, seed=args.seed)
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
