from dataclasses import asdict

import pytest

from pokemon_battle.application.battle_service import BattleService
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.infrastructure.sqlite_battle_repository import (
    SqliteBattleRepository,
    _fighter,
)

from random import Random
from uuid import uuid4

from pokemon_battle.application.battle_repository import StoredTurn, TurnResult
from pokemon_battle.domain import AttackAction, UsePotionAction
from pokemon_battle.engine import BattleEngine

@pytest.fixture
def repository(tmp_path):
    repo = SqliteBattleRepository(tmp_path / "battles.sqlite3")
    repo.initialize()
    return repo


@pytest.fixture
def record(repository):
    service = BattleService(repository, CATALOG)
    return service.create_battle("pikachu", "charmander")


def testUnAncienCombattantCommenceAvecDeuxPotions(record):
    """Un ancien instantané sans stock de potions doit rester lisible."""
    data = asdict(record.battle.first)
    data.pop("potions")
    restored = _fighter(data)
    assert restored.potions == 2

def testLeStockEstConserve(repository, record):
    """La relecture conserve le stock sauvegardé."""
    record.battle.first.potions = 1
    record.battle.second.potions = 0
    repository.save(record)
    restored = repository.get(record.id)
    assert restored is not None
    assert restored.battle.first.potions == 1
    assert restored.battle.second.potions == 0

def testLeRecuConserveLesEvenementsDuTourAvecPotion(repository, record):
    """Relire un reçu doit restituer les événements du tour, y compris le soin."""
    record.battle.first.hp = 50

    events = BattleEngine(Random(42)).play_turn(
        record.battle,
        UsePotionAction(),
        AttackAction(slot=0),
    )
    result = TurnResult(record, events)
    key = uuid4()

    receipt = StoredTurn(
        expected_turn=0,
        first_action=UsePotionAction(),
        second_action=AttackAction(slot=0),
        result=result,
    )

    with repository.transaction() as session:
        session.save(record)
        session.save_turn(record.id, key, receipt)

    with repository.transaction() as session:
        restored = session.get_turn(record.id, key)

    assert restored is not None
    assert restored.first_action == UsePotionAction()
    assert restored.second_action == AttackAction(slot=0)
    assert restored.result.events == events
    assert restored.result.record.battle.first.potions == 1
