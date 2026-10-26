from uuid import uuid4

from pokemon_battle.application.battle_repository import StoredTurn, TurnResult
from pokemon_battle.application.battle_service import BattleService
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.domain import AttackAction, BattleStat, StatusCondition
from pokemon_battle.engine import (
    AttackBlocked, BattleEnded, BurnDamage, EffectFailed, FailureReason, FullyParalyzed,
    KnockedOut, ProtectionActivated, StatChanged, StatusApplied,
)
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository


def testLeRecuRestitueLesEvenementsDeStatutAvecLeursTypes(tmp_path):
    """Un tour rejoué doit redonner les mêmes événements, énumérations comprises."""
    repository = SqliteBattleRepository(tmp_path / "battles.sqlite3")
    repository.initialize()
    record = BattleService(repository, CATALOG).create_battle("pikachu", "charmander")
    events = (
        StatusApplied(1, "a", "b", StatusCondition.PARALYSIS),
        StatChanged(1, "a", "a", BattleStat.SPECIAL_ATTACK, 2, 2),
        EffectFailed(1, "a", "b", FailureReason.IMMUNE),
        ProtectionActivated(1, "b"),
        AttackBlocked(1, "a", "b"),
        FullyParalyzed(1, "b"),
        BurnDamage(1, "a", 1, 0),
        KnockedOut(1, "a"),
        BattleEnded(1, None),
    )
    key = uuid4()
    receipt = StoredTurn(0, AttackAction(0), AttackAction(0), TurnResult(record, events))
    with repository.transaction() as session:
        session.save(record)
        session.save_turn(record.id, key, receipt)

    with repository.transaction() as session:
        restored = session.get_turn(record.id, key)

    assert restored is not None
    assert restored.result.events == events
    assert restored.result.events[0].condition is StatusCondition.PARALYSIS
    assert restored.result.events[1].stat is BattleStat.SPECIAL_ATTACK
    assert restored.result.events[2].reason is FailureReason.IMMUNE
