from dataclasses import asdict
from uuid import uuid4

from pokemon_battle import Type
from pokemon_battle.application.battle_repository import StoredBattle, StoredTurn, TurnResult
from pokemon_battle.application.battle_service import BattleService
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.domain import (
    ApplyStatus, Attack, AttackAction, BattleStat, Category, Fighter, ModifyStat, Protect, Species,
    StatStages, Stats, StatusCondition, Target,
)
from pokemon_battle.engine import (
    AttackBlocked, Battle, BattleEnded, BurnDamage, EffectFailed, FailureReason, FullyParalyzed,
    KnockedOut, ProtectionActivated, StatChanged, StatusApplied,
)
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository, _fighter

THUNDER_WAVE = Attack("Cage-Éclair", Type.ELECTRIC, None, 90, 20, Category.STATUS,
                      effects=(ApplyStatus(StatusCondition.PARALYSIS),))
SWORDS_DANCE = Attack("Danse Lames", Type.NORMAL, None, None, 20, Category.STATUS,
                      target=Target.SELF, effects=(ModifyStat(BattleStat.ATTACK, 2),))
PROTECT = Attack("Abri", Type.NORMAL, None, None, 10, Category.STATUS,
                 target=Target.SELF, priority=4, effects=(Protect(),))

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


def testLeStatutDuCombattantEstConserve(tmp_path):
    """Un tour rejoué doit redonner les mêmes événements, énumérations comprises."""
    repository = SqliteBattleRepository(tmp_path / "battles.sqlite3")
    repository.initialize()
    record = BattleService(repository, CATALOG).create_battle("pikachu", "charmander")
    record.battle.first.status = StatusCondition.PARALYSIS
    record.battle.first.stat_stages = StatStages(attack=2, speed=1)
    record.battle.first.protected_last_turn = True
    record.battle.first.protected = True

    repository.save(record)
    restored = repository.get(record.id)
    assert restored.battle.first.status is StatusCondition.PARALYSIS
    assert restored.battle.first.stat_stages.attack == 2
    assert restored.battle.first.stat_stages.speed == 1
    assert restored.battle.first.protected_last_turn is True
    assert restored.battle.first.protected is True


def testUnAncienCombattantSansEtatDeCombatEstReluAvecDesValeursNeutres(tmp_path):
    """Un instantané antérieur aux statuts n'a ni état de combat ni champs d'attaque récents : il reste lisible."""
    repository = SqliteBattleRepository(tmp_path / "battles.sqlite3")
    repository.initialize()
    record = BattleService(repository, CATALOG).create_battle("pikachu", "charmander")
    data = asdict(record.battle.first)
    for key in ("status", "stat_stages", "protected", "protected_last_turn"):
        data.pop(key)
    for attack in data["species"]["attacks"]:
        for key in ("target", "priority", "effects"):
            attack.pop(key)

    restored = _fighter(data)

    assert restored.status is None
    assert restored.stat_stages == StatStages()
    assert restored.protected is False
    assert restored.protected_last_turn is False
    assert restored.species.attacks == record.battle.first.species.attacks


def testLesAttaquesDeStatutSontReluesAvecLeursEffets(tmp_path):
    """Chaque type d'effet (statut, cran, protection) doit être retrouvé après sauvegarde et relecture."""
    # 1. Préparer le dépôt.
    repository = SqliteBattleRepository(tmp_path / "battles.sqlite3")
    repository.initialize()

    # 2. Une espèce qui connaît une attaque de chaque type d'effet.
    attacks = (THUNDER_WAVE, SWORDS_DANCE, PROTECT)
    species = Species("Pikachu", (Type.ELECTRIC,), Stats(35, 55, 40, 50, 50, 90), attacks)

    # 3. Un combat entre deux combattants de cette espèce.
    battle = Battle(Fighter("a", species), Fighter("b", species))

    # 4. Sauvegarder puis relire.
    battle_id = uuid4()
    repository.save(StoredBattle(battle_id, battle))
    restored = repository.get(battle_id)

    # 5. Les attaques relues sont identiques, effets compris.
    assert restored is not None
    assert restored.battle.first.species.attacks == attacks
