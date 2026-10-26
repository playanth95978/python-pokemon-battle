from dataclasses import FrozenInstanceError, replace

import pytest

from pokemon_battle.domain import (
    ApplyStatus, Attack, BattleStat, Category, Fighter, ModifyStat, Protect,
    Species, StatStages, Stats, StatusCondition, Target,
)
from pokemon_battle.types import Type


TACKLE = Attack("Charge", Type.NORMAL, 40, 100, 35)
PARALYSIS = ApplyStatus(StatusCondition.PARALYSIS)


def thunder_wave(**changes) -> Attack:
    attack = Attack("Cage-Éclair", Type.ELECTRIC, None, 90, 20, Category.STATUS, effects=(PARALYSIS,))
    return replace(attack, **changes)


def stage_values(stages: StatStages) -> tuple[int, ...]:
    return tuple(getattr(stages, stat.value) for stat in BattleStat)


def species() -> Species:
    return Species("Pikachu", (Type.ELECTRIC,), Stats(35, 55, 40, 50, 50, 90), (TACKLE, thunder_wave()))


def testUneAttaqueDeParalysieSeCreeSansPuissanceNiDegats():
    """Cage-Éclair est une attaque de statut : aucune puissance, un seul effet de paralysie."""
    attack = Attack("Cage-Éclair", Type.ELECTRIC, None, 90, 20, Category.STATUS, effects=[PARALYSIS])
    assert attack.category is Category.STATUS
    assert attack.power is None
    assert attack.accuracy == 90
    assert attack.target is Target.OPPONENT
    assert attack.priority == 0
    assert attack.effects == (ApplyStatus(StatusCondition.PARALYSIS),)
    assert isinstance(attack.effects, tuple)
    with pytest.raises(FrozenInstanceError):
        attack.effects = ()
    with pytest.raises(FrozenInstanceError):
        attack.effects[0].condition = StatusCondition.BURN


def testUnePuissanceNulleDAttaqueDeStatutDevientUnePuissanceAbsente():
    """Une seule représentation de « pas de puissance » pour le moteur et la persistance."""
    assert thunder_wave(power=0).power is None


def testLesAttaquesExistantesGardentDesValeursParDefautNeutres():
    assert TACKLE.category is Category.PHYSICAL
    assert TACKLE.target is Target.OPPONENT
    assert TACKLE.priority == 0
    assert TACKLE.effects == ()


def testLaPrecisionNonApplicableEstRepresenteeExplicitement():
    """Une protection visant son lanceur ne fait aucun test de précision."""
    protect = Attack("Abri", Type.NORMAL, None, None, 10, Category.STATUS,
                     target=Target.SELF, priority=4, effects=(Protect(),))
    assert protect.accuracy is None
    assert protect.target is Target.SELF
    assert protect.priority == 4


def testUneCibleSerialiseeEstRelueCommeEnumeration():
    """Un instantané JSON stocke la cible en texte ; la définition retrouve l'énumération."""
    attack = Attack("Danse Lames", Type.NORMAL, None, None, 20, Category.STATUS,
                    target="self", effects=(ModifyStat(BattleStat.ATTACK, 2),))
    assert attack.target is Target.SELF


@pytest.mark.parametrize("changes,message", [
    ({"category": Category.PHYSICAL}, "power"),
    ({"category": Category.SPECIAL, "power": 0}, "power"),
    ({"power": 40}, "status attack"),
    ({"effects": ()}, "at least one effect"),
    ({"category": Category.SPECIAL, "power": 90}, "damaging attacks"),
    ({"target": Target.SELF}, "accuracy"),
    ({"target": "both"}, "Target"),
    ({"accuracy": 0}, "accuracy"),
    ({"accuracy": 101}, "accuracy"),
    ({"priority": 6}, "priority"),
    ({"priority": -8}, "priority"),
    ({"priority": 1.0}, "priority"),
    ({"effects": (StatusCondition.PARALYSIS,)}, "effect"),
    ({"effects": (Protect(),)}, "user"),
])
def testUneCombinaisonIncoherenteDAttaqueEstRefusee(changes, message):
    with pytest.raises(ValueError, match=message):
        thunder_wave(**changes)


def testUneAttaqueADegatsNePeutPasViserSonLanceur():
    with pytest.raises(ValueError, match="opponent"):
        Attack("Charge", Type.NORMAL, 40, None, 35, target=Target.SELF)


@pytest.mark.parametrize("build,message", [
    (lambda: ApplyStatus("paralysis"), "status condition"),
    (lambda: ModifyStat(BattleStat.SPEED, 0), "stages"),
    (lambda: ModifyStat(BattleStat.SPEED, 7), "stages"),
    (lambda: ModifyStat("hp", 1), "statistic"),
    (lambda: StatStages(speed=7), "speed"),
    (lambda: StatStages(attack=-7), "attack"),
    (lambda: StatStages(defense=True), "defense"),
])
def testUnEffetOuUneModificationHorsBornesEstRefuse(build, message):
    with pytest.raises(ValueError, match=message):
        build()


def testUnCombattantNeufNaNiStatutNiModificationNiProtection():
    fighter = Fighter("a", species())
    assert fighter.status is None
    assert fighter.stat_stages == StatStages()
    assert all(stage == 0 for stage in stage_values(fighter.stat_stages))
    assert fighter.protected is False


def testLEtatDeStatutEstIndependantEntreDeuxCombattants():
    """Partager une espèce ne doit partager ni statut, ni modifications, ni protection."""
    shared = species()
    first, second = Fighter("a", shared), Fighter("b", shared)
    first.status = StatusCondition.PARALYSIS
    first.stat_stages = replace(first.stat_stages, speed=-2)
    first.protected = True
    assert second.status is None
    assert second.stat_stages == StatStages()
    assert second.protected is False


def testModifierLEtatDuCombattantNeMutePasLEspece():
    """Les statistiques de l'espèce restent la référence ; seules les modifications changent."""
    shared = species()
    before = Species(shared.name, shared.types, shared.stats, shared.attacks)
    fighter = Fighter("a", shared)
    fighter.status = StatusCondition.PARALYSIS
    fighter.stat_stages = StatStages(attack=2, speed=-1)
    assert shared == before
    assert shared.stats.speed == 90
    with pytest.raises(FrozenInstanceError):
        fighter.stat_stages.speed = 6
    with pytest.raises(FrozenInstanceError):
        shared.stats.speed = 45
