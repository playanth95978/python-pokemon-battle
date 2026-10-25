"""Estimations sans mutation, alignées sur la résolution effective du moteur."""

import asyncio
from dataclasses import asdict, replace

import pytest

from pokemon_battle.application.ai.generation import Completion, ToolCall
from pokemon_battle.application.ai.opponent import ToolCallingOpponent
from pokemon_battle.application.ai.scenarios import SCENARIOS
from pokemon_battle.application.ai.tools import execute_tool
from pokemon_battle.application.ai.tools_context import ToolsContext
from pokemon_battle.engine import BattleEngine, DamageDealt


def estimate(record):
    ctx = ToolsContext.from_record(record, "agent", 0)
    result = execute_tool(ctx, ToolCall("estimate01", "estimate_damage", "{}"))
    return ctx, result


def testLaResistanceCompareLesDegatsPhysiquesEtSpeciauxSansModifierLeCombat():
    """La précision des statistiques et des arrondis permet de départager Charge et Éclair."""
    record = SCENARIOS["grass_resistance"].create()
    before = asdict(record)
    ctx, result = estimate(record)
    electric, normal = result["estimates"]
    assert electric == {
        "slot": 0, "name": "Éclair", "category": "special", "type_multiplier": 0.5,
        "stab_multiplier": 1.5, "hit_probability": 1.0, "min_damage_on_hit": 9,
        "max_damage_on_hit": 11, "mean_damage_on_hit": 9.9375,
        "expected_damage": 9.9375, "ko_probability": 0.0,
    }
    assert (normal["min_damage_on_hit"], normal["max_damage_on_hit"], normal["expected_damage"]) == (12, 15, 13.375)
    assert ctx.observations["estimate_damage"] == result
    assert ctx.decision is None
    assert asdict(record) == before
    record.battle.first.hp = 1
    assert execute_tool(ctx, ToolCall("estimate02", "estimate_damage", "{}")) == result


def testUneImmuniteProduitZeroDegatEtLesPpEpuisesSontExclus():
    """Un slot légal immunisé reste visible, tandis qu'une attaque sans PP n'est pas proposée."""
    _, result = estimate(SCENARIOS["pikachu_vs_ground"].create())
    electric = result["estimates"][0]
    assert [electric[key] for key in ("min_damage_on_hit", "max_damage_on_hit", "expected_damage", "ko_probability")] == [0, 0, 0.0, 0.0]
    _, depleted = estimate(SCENARIOS["exhausted_move"].create())
    assert [item["slot"] for item in depleted["estimates"]] == [1]


def testLesDegatsSontBornesAuxPvEtLeKoInclutLaProbabiliteDeRater():
    """Une cible à un PV perd au plus un PV, et une précision de 50 % ne garantit pas le KO."""
    record = SCENARIOS["grass_resistance"].create()
    actor = record.battle.second
    actor.species = replace(actor.species, attacks=tuple(replace(move, accuracy=50) for move in actor.species.attacks))
    record.battle.first.hp = 1
    _, result = estimate(record)
    for item in result["estimates"]:
        assert (item["min_damage_on_hit"], item["max_damage_on_hit"], item["mean_damage_on_hit"]) == (1, 1, 1.0)
        assert item["expected_damage"] == 0.5
        assert item["ko_probability"] == 0.5


def testLaProbabiliteDeKoCompteChaqueTirageAvecSesArrondis():
    """Charge fait au moins 14 dégâts pour 7 tirages sur 16, et touche une fois sur deux."""
    record = SCENARIOS["grass_resistance"].create()
    actor = record.battle.second
    actor.species = replace(actor.species, attacks=tuple(replace(move, accuracy=50) for move in actor.species.attacks))
    record.battle.first.hp = 14
    _, result = estimate(record)
    assert result["estimates"][1]["ko_probability"] == 7 / 32


@pytest.mark.parametrize("name", list(SCENARIOS))
def testLesBornesCorrespondentAuxDegatsReelsPourChaqueTirage(name):
    """La résolution publique du moteur reste cohérente avec les estimations, sans changer sa séquence RNG."""
    record = SCENARIOS[name].create()
    _, result = estimate(record)
    for item in result["estimates"]:
        damages = []
        for roll in range(85, 101):
            class FixedRandom:
                def randint(self, lower, upper):
                    return roll if (lower, upper) == (85, 100) else lower
            fresh = SCENARIOS[name].create()
            events = BattleEngine(FixedRandom()).play_turn(fresh.battle, 0, item["slot"])
            damages.append(next(event.damage for event in events if isinstance(event, DamageDealt) and event.actor == "agent"))
        assert min(damages) == item["min_damage_on_hit"]
        assert max(damages) == item["max_damage_on_hit"]
        assert sum(damages) / 16 == item["mean_damage_on_hit"]


def testLeResultatEstTransmisAuModeleAvantSaSelection():
    """L'agent reçoit les estimations avec le bon identifiant, puis reste libre de choisir son slot."""
    class Client:
        async def complete(self, messages, **kwargs):
            if len(messages) == 2:
                assert "estimate_damage" in messages[0].content
                return Completion(None, {}, (ToolCall("estimate01", "estimate_damage", "{}"),))
            import json
            assert messages[-1].tool_call_id == "estimate01"
            result = json.loads(messages[-1].content)
            assert result["estimates"][1]["expected_damage"] == 13.375
            return Completion(None, {}, (ToolCall("select001", "select_attack", '{"slot":1}'),))
    ctx = ToolsContext.from_record(SCENARIOS["grass_resistance"].create(), "agent", 0)
    decision = asyncio.run(ToolCallingOpponent(Client()).choose(ctx))
    assert (decision.slot, decision.source) == (1, "llm")
    assert ctx.metrics.tool_calls_executed == 2
    assert ctx.metrics.tool_errors == 0
