"""Persistance et idempotence du cas d'usage de potion."""

from dataclasses import asdict
from random import Random
from uuid import uuid4

import pytest

from pokemon_battle.application.battle_service import BattleService
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.domain import AttackAction, UsePotionAction
from pokemon_battle.engine import BattleEngine, PotionUsed
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository


@pytest.fixture
def service(tmp_path) -> BattleService:
    repository = SqliteBattleRepository(tmp_path / "battles.sqlite3")
    repository.initialize()
    return BattleService(repository, CATALOG, BattleEngine(Random(42)))


def testUnePotionEstSauvegardeeEtUneRepriseNeLaConsommePasDeuxFois(service):
    """Une même commande rejouée doit restituer le soin sans modifier à nouveau le combat."""
    record = service.create_battle("pikachu", "charmander")
    record.battle.first.hp = 50
    initial_pp = record.battle.first.pp.copy()
    service.repository.save(record)
    key = uuid4()
    first_action = UsePotionAction()
    second_action = AttackAction(attack_slot=0)

    result = service.play_turn(
        record.id, first_action, second_action,
        expected_turn=0, idempotency_key=key,
    )

    assert result.record.battle.turn == 1
    assert result.events[0] == PotionUsed(1, record.battle.first.id, 20, 70, 1)
    saved = service.get_battle(record.id)
    assert saved is not None
    assert saved == result.record
    assert saved.battle.first.potions == 1
    assert saved.battle.first.pp == initial_pp
    # Seule Charge (emplacement 0) a été jouée ; Feu Follet et Danse Lames restent intacts.
    assert saved.battle.second.pp == [34, 25, 15, 20]
    before_retry = asdict(saved)

    # Recréer le service prouve que la reprise utilise SQLite plutôt qu'un cache en mémoire.
    resumed_service = BattleService(service.repository, CATALOG, BattleEngine(Random(99)))
    replay = resumed_service.play_turn(
        record.id, first_action, second_action,
        expected_turn=0, idempotency_key=key,
    )

    assert replay == result
    after_retry = resumed_service.get_battle(record.id)
    assert after_retry is not None
    assert asdict(after_retry) == before_retry
