from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from pokemon_battle.api.app import create_app
from pokemon_battle.api.schemas import event_response
from pokemon_battle.application.battle_repository import StoredBattle
from pokemon_battle.domain import (
    ApplyStatus, Attack, BattleStat, Category, Fighter, ModifyStat, Species, StatStages, Stats,
    StatusCondition, Target,
)
from pokemon_battle.engine import (
    AttackBlocked, Battle, BattleEnded, BattleEngine, BurnDamage, EffectFailed, FailureReason,
    FullyParalyzed, ProtectionActivated, StatChanged, StatusApplied,
)
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository
from pokemon_battle.types import Type


THUNDER_WAVE = Attack("Cage-Éclair", Type.ELECTRIC, None, 90, 20, Category.STATUS,
                      effects=(ApplyStatus(StatusCondition.PARALYSIS),))
SWORDS_DANCE = Attack("Danse Lames", Type.NORMAL, None, None, 20, Category.STATUS,
                      target=Target.SELF, effects=(ModifyStat(BattleStat.ATTACK, 2),))


class MinimumRolls:
    """Touche toujours et, pour un paralysé, l'empêche toujours d'agir."""

    def randint(self, a, b):
        return a


def fighter(id: str, speed: int) -> Fighter:
    return Fighter(id, Species(id, (Type.NORMAL,), Stats(120, 60, 60, 60, 60, speed), (THUNDER_WAVE, SWORDS_DANCE)))


@pytest.fixture
def context(tmp_path):
    path = tmp_path / "battles.sqlite3"
    app = create_app(path)
    with TestClient(app) as client:
        app.state.battle_service.engine = BattleEngine(MinimumRolls())
        yield client, SqliteBattleRepository(path)


def saved_battle(repository: SqliteBattleRepository, battle: Battle) -> StoredBattle:
    record = StoredBattle(uuid4(), battle)
    repository.save(record)
    return record


def turn(**moves) -> dict:
    return {"expected_turn": 0, "idempotency_key": str(uuid4()), **moves}


def testUnTourDeParalysieExposeLesEvenementsEtLeStatut(context):
    """Le client reçoit les événements de statut et l'état du combattant paralysé."""
    client, repository = context
    record = saved_battle(repository, Battle(fighter("a", 90), fighter("b", 80)))
    response = client.post(f"/battles/{record.id}/turns", json=turn(first_move=0, second_move=1))
    assert response.status_code == 200
    data = response.json()
    assert data["events"] == [
        {"type": "attack_used", "turn": 1, "actor": "a", "target": "b", "attack": "Cage-Éclair",
         "pp_remaining": 19, "attack_type": "electric", "attack_slot": 0},
        {"type": "status_applied", "turn": 1, "actor": "a", "target": "b", "condition": "paralysis"},
        {"type": "fully_paralyzed", "turn": 1, "actor": "b"},
    ]
    assert data["battle"]["second"]["status"] == "paralysis"
    assert data["battle"]["first"]["status"] is None
    assert data["battle"]["is_over"] is False


def testLeCombattantExposeSesCransEtSesAttaquesDeStatut(context):
    client, repository = context
    battle = Battle(fighter("a", 90), fighter("b", 80))
    battle.first.stat_stages = StatStages(attack=2, speed=-1)
    record = saved_battle(repository, battle)
    data = client.get(f"/battles/{record.id}").json()
    assert data["first"]["stat_stages"] == {
        "attack": 2, "defense": 0, "special_attack": 0, "special_defense": 0, "speed": -1,
    }
    assert data["first"]["attacks"][0] == {
        "attack_slot": 0, "name": "Cage-Éclair", "pp": 20, "max_pp": 20,
        "category": "status", "priority": 0, "target": "opponent",
    }
    assert data["first"]["attacks"][1]["target"] == "self"


def testUnDoubleKOEstUnCombatTermineSansVainqueur(context):
    """Sans is_over, un match nul (winner à null) ressemblerait à un combat en cours."""
    client, repository = context
    battle = Battle(fighter("a", 90), fighter("b", 80))
    battle.first.hp = battle.second.hp = 0
    record = saved_battle(repository, battle)
    data = client.get(f"/battles/{record.id}").json()
    assert data["winner"] is None
    assert data["is_over"] is True
    response = client.post(f"/battles/{record.id}/turns", json=turn(first_move=0, second_move=0))
    assert response.status_code == 409


@pytest.mark.parametrize("event,expected", [
    (FullyParalyzed(2, "b"), {"type": "fully_paralyzed", "turn": 2, "actor": "b"}),
    (AttackBlocked(2, "a", "b"), {"type": "attack_blocked", "turn": 2, "actor": "a", "target": "b"}),
    (StatusApplied(2, "a", "b", StatusCondition.BURN),
     {"type": "status_applied", "turn": 2, "actor": "a", "target": "b", "condition": "burn"}),
    (StatChanged(2, "a", "a", BattleStat.SPEED, -1, -2),
     {"type": "stat_changed", "turn": 2, "actor": "a", "target": "a", "stat": "speed", "change": -1, "stage": -2}),
    (ProtectionActivated(2, "a"), {"type": "protection_activated", "turn": 2, "actor": "a"}),
    (EffectFailed(2, "a", "b", FailureReason.IMMUNE),
     {"type": "effect_failed", "turn": 2, "actor": "a", "target": "b", "reason": "immune",
      "stat": None, "stage": None}),
    (EffectFailed(2, "a", "a", FailureReason.STAT_LIMIT, BattleStat.ATTACK, 6),
     {"type": "effect_failed", "turn": 2, "actor": "a", "target": "a", "reason": "stat_limit",
      "stat": "attack", "stage": 6}),
    (BurnDamage(2, "a", 7, 113), {"type": "burn_damage", "turn": 2, "fighter": "a", "damage": 7, "hp_remaining": 113}),
    (BattleEnded(2, None), {"type": "battle_ended", "turn": 2, "winner": None}),
])
def testChaqueNouvelEvenementAUnContratHttp(event, expected):
    assert event_response(event).model_dump(mode="json") == expected
