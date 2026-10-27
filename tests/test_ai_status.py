"""L'IA voit statuts, crans et protection, estime avec la formule du moteur et sait jouer une attaque de statut."""

import asyncio
from fractions import Fraction
from uuid import UUID

import pytest

from pokemon_battle.application.ai.generation import ToolCall
from pokemon_battle.application.ai.opponent import LocalOpponent
from pokemon_battle.application.ai.tools import execute_tool, precompute_observations, tool_schemas
from pokemon_battle.application.ai.tools_context import ToolsContext
from pokemon_battle.application.battle_repository import StoredBattle
from pokemon_battle.damage import damage_for_roll
from pokemon_battle.domain import (
    ApplyStatus, Attack, BattleStat, Category, Fighter, ModifyStat, Protect, Species, StatStages, Stats,
    StatusCondition, Target,
)
from pokemon_battle.engine import Battle
from pokemon_battle.types import Type

TACKLE = Attack("Charge", Type.NORMAL, 40, 100, 35)
QUICK_ATTACK = Attack("Vive-Attaque", Type.NORMAL, 40, 100, 30, priority=1)
THUNDER_WAVE = Attack("Cage Éclair", Type.ELECTRIC, None, 90, 20, Category.STATUS,
                      effects=(ApplyStatus(StatusCondition.PARALYSIS),))
SWORDS_DANCE = Attack("Danse Lames", Type.NORMAL, None, None, 20, Category.STATUS,
                      target=Target.SELF, effects=(ModifyStat(BattleStat.ATTACK, 2),))
PROTECT = Attack("Abri", Type.NORMAL, None, None, 10, Category.STATUS,
                 target=Target.SELF, priority=4, effects=(Protect(),))
STATS = Stats(120, 60, 60, 60, 60, 90)


def battle(ai_attacks=(TACKLE, THUNDER_WAVE, SWORDS_DANCE, PROTECT), human_types=(Type.NORMAL,),
           ai_speed=90, human_speed=80) -> Battle:
    ai = Fighter("ai", Species("Agent", (Type.ELECTRIC,), Stats(120, 60, 60, 60, 60, ai_speed), ai_attacks))
    human = Fighter("human", Species("Joueur", human_types, Stats(120, 60, 60, 60, 60, human_speed), (TACKLE,)))
    return Battle(human, ai)


def context(battle: Battle) -> ToolsContext:
    return ToolsContext.from_record(StoredBattle(UUID(int=7), battle), "ai", 0)


def tool(ctx: ToolsContext, name: str) -> dict:
    return execute_tool(ctx, ToolCall(f"call-{name}", name, "{}"))


def testLaVueExposeStatutCransEtVitesseEffective():
    current = battle()
    current.second.status = StatusCondition.PARALYSIS
    current.second.stat_stages = StatStages(attack=2)
    view = tool(context(current), "inspect_battle")
    assert view["fighter"]["status"] == "paralysis"
    assert view["fighter"]["stat_stages"]["attack"] == 2
    assert view["fighter"]["effective_speed"] == 45
    assert view["opponent"]["status"] is None
    assert view["opponent"]["effective_speed"] == 80


def testLesAttaquesJouablesDecriventCiblePrioriteEtEffets():
    moves = {move["name"]: move for move in tool(context(battle()), "list_legal_moves")["moves"]}
    assert moves["Abri"]["priority"] == 4
    assert moves["Abri"]["target"] == "self"
    assert moves["Abri"]["effects"] == [{"effect_type": "protect"}]
    assert moves["Cage Éclair"]["effects"] == [{"effect_type": "apply_status", "condition": "paralysis"}]
    assert moves["Charge"]["effects"] == []


def testLEstimationDeDegatsAppliqueCransEtBrulureCommeLeMoteur():
    current = battle()
    current.second.stat_stages = StatStages(attack=2)
    current.second.status = StatusCondition.BURN
    current.first.stat_stages = StatStages(defense=-1)
    tackle = tool(context(current), "estimate_damage")["estimates"][0]
    expected = [damage_for_roll(50, STATS, current.first.species.stats, TACKLE, (Type.ELECTRIC,), Fraction(1), roll,
                                attack_stage=2, defense_stage=-1, burned=True) for roll in (85, 100)]
    assert [tackle["min_damage_on_hit"], tackle["max_damage_on_hit"]] == expected


def testLEvaluationPrevoitLeResultatDeChaqueAttaqueDeStatut():
    result = tool(context(battle()), "evaluate_status_moves")["status_moves"]
    assert result == [
        {"attack_slot": 1, "name": "Cage Éclair", "target": "opponent", "priority": 0, "hit_probability": 0.9,
         "would_have_effect": True,
         "effects": [{"effect_type": "apply_status", "condition": "paralysis", "applies": True, "reason": None}]},
        {"attack_slot": 2, "name": "Danse Lames", "target": "self", "priority": 0, "hit_probability": 1.0,
         "would_have_effect": True,
         "effects": [{"effect_type": "modify_stat", "stat": "attack", "stages": 2, "applies": True, "reason": None,
                      "stage_after": 2}]},
        {"attack_slot": 3, "name": "Abri", "target": "self", "priority": 4, "hit_probability": 1.0,
         "would_have_effect": True,
         "effects": [{"effect_type": "protect", "applies": True, "reason": None}]},
    ]


@pytest.mark.parametrize("prepare,slot,reason", [
    (lambda b: setattr(b.first, "status", StatusCondition.BURN), 1, "already_has_status"),
    (lambda b: setattr(b.second, "stat_stages", StatStages(attack=6)), 2, "stat_limit"),
    (lambda b: setattr(b.second, "protected_last_turn", True), 3, "consecutive_protection"),
])
def testLEvaluationAnnonceLesEchecsPrevisibles(prepare, slot, reason):
    current = battle()
    prepare(current)
    moves = {move["attack_slot"]: move for move in tool(context(current), "evaluate_status_moves")["status_moves"]}
    assert moves[slot]["would_have_effect"] is False
    assert moves[slot]["effects"][0]["reason"] == reason


def testUneCibleElectriqueEstImmuniseeContreLaParalysie():
    moves = tool(context(battle(human_types=(Type.ELECTRIC,))), "evaluate_status_moves")["status_moves"]
    assert moves[0]["effects"][0]["reason"] == "immune"


def testLOrdreDActionUtiliseLaVitesseEffective():
    """90 paralysé vaut 45 : l'adversaire à 80 agit d'abord."""
    current = battle()
    current.second.status = StatusCondition.PARALYSIS
    incoming = tool(context(current), "estimate_incoming_damage")
    assert incoming["turn_order"] == "opponent_attacks_first"


def testUneAttaquePrioritaireTermineAvantLaRipostePourUnCombattantLent():
    current = battle(ai_attacks=(QUICK_ATTACK, TACKLE), ai_speed=30)
    current.first.hp = 1
    incoming = tool(context(current), "estimate_incoming_damage")
    assert incoming["turn_order"] == "opponent_attacks_first"
    assert incoming["best_ko_before_riposte"] == {"name": "Vive-Attaque", "probability": 1.0}


def testUnCombattantParaliseNAgitQueTroisFoisSurQuatre():
    current = battle(ai_attacks=(QUICK_ATTACK,))
    current.first.hp = 1
    current.second.status = StatusCondition.PARALYSIS
    incoming = tool(context(current), "estimate_incoming_damage")
    assert incoming["best_ko_before_riposte"] == {"name": "Vive-Attaque", "probability": 0.75}


@pytest.mark.parametrize("prepare,slot", [
    (lambda b: None, 1),  # Adversaire en forme et sans statut : paralyser d'abord.
    (lambda b: setattr(b.first, "status", StatusCondition.BURN), 0),  # Statut déjà présent : attaquer.
    (lambda b: setattr(b.first, "hp", 60), 0),  # Moitié des PV : attaquer.
])
def testLeSecoursLocalParalyseUnAdversaireEnFormePuisAttaque(prepare, slot):
    current = battle()
    prepare(current)
    assert asyncio.run(LocalOpponent().choose(context(current))).attack_slot == slot


def testLeSecoursLocalNeTenteJamaisUneParalysieImpossible():
    current = battle(human_types=(Type.ELECTRIC,))
    assert asyncio.run(LocalOpponent().choose(context(current))).attack_slot == 0


def testLEvaluationDesStatutsFaitPartieDesLecturesPrecalculees():
    assert "evaluate_status_moves" in {schema["function"]["name"] for schema in tool_schemas()}
    ctx = context(battle())
    precompute_observations(ctx)
    assert ctx.observations["evaluate_status_moves"]["status_moves"][0]["name"] == "Cage Éclair"
