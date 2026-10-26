from fractions import Fraction

import pytest

from pokemon_battle.damage import damage_for_roll
from pokemon_battle.domain import (
    ApplyStatus, Attack, BattleStat, Category, Fighter, ModifyStat, Protect,
    Species, StatStages, Stats, StatusCondition, Target,
)
from pokemon_battle.engine import (
    AttackBlocked, AttackMissed, AttackUsed, Battle, BattleEnded, BattleEngine, BurnDamage,
    DamageDealt, EffectFailed, FullyParalyzed, KnockedOut, ProtectionActivated, StatChanged,
    StatusApplied,
)
from pokemon_battle.types import Type


TACKLE = Attack("Charge", Type.NORMAL, 40, 100, 35)
QUICK_ATTACK = Attack("Vive-Attaque", Type.NORMAL, 40, 100, 30, priority=1)
THUNDER_WAVE = Attack("Cage-Éclair", Type.ELECTRIC, None, 90, 20, Category.STATUS,
                      effects=(ApplyStatus(StatusCondition.PARALYSIS),))
WILL_O_WISP = Attack("Feu Follet", Type.FIRE, None, 85, 15, Category.STATUS,
                     effects=(ApplyStatus(StatusCondition.BURN),))
SWORDS_DANCE = Attack("Danse Lames", Type.NORMAL, None, None, 20, Category.STATUS,
                      target=Target.SELF, effects=(ModifyStat(BattleStat.ATTACK, 2),))
PROTECT = Attack("Abri", Type.NORMAL, None, None, 10, Category.STATUS,
                 target=Target.SELF, priority=4, effects=(Protect(),))
MOVES = (TACKLE, THUNDER_WAVE, SWORDS_DANCE, PROTECT)
TACKLE_SLOT, THUNDER_WAVE_SLOT, SWORDS_DANCE_SLOT, PROTECT_SLOT = range(4)


class Rolls:
    def __init__(self, *values):
        self.values = list(values)

    def randint(self, a, b):
        value = self.values.pop(0)
        assert a <= value <= b
        return value


def fighter(id, speed=80, hp=251, types=(Type.NORMAL,), attacks=MOVES):
    return Fighter(id, Species(id, types, Stats(hp, 101, 89, 127, 97, speed), attacks))


def play(battle, rolls, first, second):
    events = BattleEngine(rolls).play_turn(battle, first, second)
    assert rolls.values == [], "tous les tirages prévus doivent être consommés"
    return events


def testCageEclairParalyseLaCibleSansInfligerDeDegats():
    a, b = fighter("a", speed=90), fighter("b")
    battle = Battle(a, b)
    # Précision de a, contrôle de paralysie de b (26 : il agit), précision de b.
    events = play(battle, Rolls(90, 26, 1), THUNDER_WAVE_SLOT, THUNDER_WAVE_SLOT)
    assert events == (
        AttackUsed(1, "a", "b", "Cage-Éclair", 19, Type.ELECTRIC, 1),
        StatusApplied(1, "a", "b", StatusCondition.PARALYSIS),
        AttackUsed(1, "b", "a", "Cage-Éclair", 19, Type.ELECTRIC, 1),
        StatusApplied(1, "b", "a", StatusCondition.PARALYSIS),
    )
    assert a.status is b.status is StatusCondition.PARALYSIS
    assert a.hp == b.hp == 251


def testUneAttaqueDeStatutPeutRaterSaCible():
    battle = Battle(fighter("a", speed=90), fighter("b"))
    events = play(battle, Rolls(91), THUNDER_WAVE_SLOT, SWORDS_DANCE_SLOT)
    assert events[1] == AttackMissed(1, "a", "b")
    assert battle.second.status is None


def testUnCombattantParalyseRateSonTourSansConsommerDePP():
    a, b = fighter("a", speed=90), fighter("b")
    b.status = StatusCondition.PARALYSIS
    events = play(Battle(a, b), Rolls(25), SWORDS_DANCE_SLOT, TACKLE_SLOT)
    assert events == (
        AttackUsed(1, "a", "a", "Danse Lames", 19, Type.NORMAL, 2),
        StatChanged(1, "a", "a", BattleStat.ATTACK, 2, 2),
        FullyParalyzed(1, "b"),
    )
    assert b.pp[TACKLE_SLOT] == 35
    assert a.hp == 251


def testLaParalysieDiviseLaVitesseEffective():
    """100 paralysé vaut 50 : le combattant à 60 agit d'abord."""
    a, b = fighter("a", speed=100), fighter("b", speed=60)
    a.status = StatusCondition.PARALYSIS
    events = play(Battle(a, b), Rolls(100), SWORDS_DANCE_SLOT, SWORDS_DANCE_SLOT)
    assert [event.actor for event in events if isinstance(event, AttackUsed)] == ["b", "a"]


def testLesCransDeVitesseModifientLOrdreDAction():
    """100 à -1 cran vaut 66 : le combattant à 80 agit d'abord."""
    a, b = fighter("a", speed=100), fighter("b", speed=80)
    a.stat_stages = StatStages(speed=-1)
    events = play(Battle(a, b), Rolls(), SWORDS_DANCE_SLOT, SWORDS_DANCE_SLOT)
    assert [event.actor for event in events if isinstance(event, AttackUsed)] == ["b", "a"]


def testUneEgaliteDeVitesseEffectiveEstTireeAuSort():
    a, b = fighter("a", speed=100), fighter("b", speed=50)
    a.status = StatusCondition.PARALYSIS
    # Égalité 50/50 tranchée pour b, puis contrôle de paralysie de a.
    events = play(Battle(a, b), Rolls(1, 100), SWORDS_DANCE_SLOT, SWORDS_DANCE_SLOT)
    assert [event.actor for event in events if isinstance(event, AttackUsed)] == ["b", "a"]


def testLaPrioriteDevanceLaVitesse():
    a = fighter("a", speed=30, attacks=(QUICK_ATTACK, SWORDS_DANCE))
    b = fighter("b", speed=120)
    events = play(Battle(a, b), Rolls(1, 100), 0, SWORDS_DANCE_SLOT)
    assert events[0] == AttackUsed(1, "a", "b", "Vive-Attaque", 29, Type.NORMAL, 0)
    assert isinstance(events[1], DamageDealt)


def testLesCransDAttaqueEtDeDefenseEntrentDansLaFormule():
    """+2 en attaque équivaut à une attaque doublée ; -2 en défense à une défense divisée par 2."""
    offense, defense = Stats(100, 100, 80, 100, 80, 50), Stats(100, 100, 80, 100, 80, 50)
    doubled = Stats(100, 200, 80, 100, 80, 50)
    halved = Stats(100, 100, 40, 100, 40, 50)
    arguments = (TACKLE, (Type.FIRE,), Fraction(1), 100)
    assert damage_for_roll(50, offense, defense, *arguments, attack_stage=2) \
        == damage_for_roll(50, doubled, defense, *arguments)
    assert damage_for_roll(50, offense, defense, *arguments, defense_stage=-2) \
        == damage_for_roll(50, offense, halved, *arguments)


def testLeMoteurAppliqueLesCransDuCombattant():
    a, b = fighter("a", speed=90), fighter("b")
    a.stat_stages = StatStages(attack=2)
    events = play(Battle(a, b), Rolls(1, 100), TACKLE_SLOT, SWORDS_DANCE_SLOT)
    expected = damage_for_roll(50, a.species.stats, b.species.stats, TACKLE, a.species.types,
                               Fraction(1), 100, attack_stage=2)
    assert events[1].damage == expected
    assert expected > damage_for_roll(50, a.species.stats, b.species.stats, TACKLE,
                                      a.species.types, Fraction(1), 100)


def testLaBrulureDiviseSeulementLesDegatsPhysiques():
    stats = Stats(100, 100, 80, 100, 80, 50)
    special = Attack("Flammèche", Type.FIRE, 40, 100, 25, Category.SPECIAL)
    normal = damage_for_roll(50, stats, stats, TACKLE, (Type.FIRE,), Fraction(1), 100)
    assert damage_for_roll(50, stats, stats, TACKLE, (Type.FIRE,), Fraction(1), 100, burned=True) == normal // 2
    assert damage_for_roll(50, stats, stats, special, (Type.FIRE,), Fraction(1), 100, burned=True) \
        == damage_for_roll(50, stats, stats, special, (Type.FIRE,), Fraction(1), 100)


def testLaBrulureInfligeUnSeiziemeDesPVEnFinDeTour():
    a, b = fighter("a", speed=90, hp=160), fighter("b", hp=15)
    a.status = b.status = StatusCondition.BURN
    events = play(Battle(a, b), Rolls(), SWORDS_DANCE_SLOT, SWORDS_DANCE_SLOT)
    assert events[-2:] == (BurnDamage(1, "a", 10, 150), BurnDamage(1, "b", 1, 14))


def testUnStatutDejaPresentOuUneImmuniteFaitEchouerLEffet():
    attacks = (THUNDER_WAVE, WILL_O_WISP, SWORDS_DANCE)
    a = fighter("a", speed=90, attacks=attacks)
    b = fighter("b", types=(Type.FIRE,), attacks=attacks)
    battle = Battle(a, b)
    events = play(battle, Rolls(1), 1, 2)
    assert events[1] == EffectFailed(1, "a", "b", "immune")
    b.status = StatusCondition.BURN
    events = play(battle, Rolls(1), 0, 2)
    assert events[1] == EffectFailed(2, "a", "b", "already_has_status")
    assert b.status is StatusCondition.BURN


def testUnCranBorneEstTronqueOuEchoue():
    a, b = fighter("a", speed=90), fighter("b")
    a.stat_stages = StatStages(attack=5)
    battle = Battle(a, b)
    events = play(battle, Rolls(), SWORDS_DANCE_SLOT, SWORDS_DANCE_SLOT)
    assert events[1] == StatChanged(1, "a", "a", BattleStat.ATTACK, 1, 6)
    events = play(battle, Rolls(), SWORDS_DANCE_SLOT, SWORDS_DANCE_SLOT)
    assert events[1] == EffectFailed(2, "a", "a", "stat_limit")
    assert a.stat_stages.attack == 6
    assert a.species.stats.attack == 101


def testLAbriBloqueLAttaqueAdverseEtSeLeveEnFinDeTour():
    a, b = fighter("a", speed=30), fighter("b", speed=120)
    battle = Battle(a, b)
    events = play(battle, Rolls(), PROTECT_SLOT, TACKLE_SLOT)
    assert events == (
        AttackUsed(1, "a", "a", "Abri", 9, Type.NORMAL, 3),
        ProtectionActivated(1, "a"),
        AttackUsed(1, "b", "a", "Charge", 34, Type.NORMAL, 0),
        AttackBlocked(1, "b", "a"),
    )
    assert a.hp == 251
    assert a.protected is False


def testLAbriEchoueSiUtiliseDeuxToursDeSuite():
    a, b = fighter("a", speed=30), fighter("b", speed=120)
    battle = Battle(a, b)
    play(battle, Rolls(), PROTECT_SLOT, SWORDS_DANCE_SLOT)
    events = play(battle, Rolls(1, 100), PROTECT_SLOT, TACKLE_SLOT)
    assert events[1] == EffectFailed(2, "a", "a", "consecutive_protection")
    assert isinstance(events[3], DamageDealt)
    events = play(battle, Rolls(), PROTECT_SLOT, SWORDS_DANCE_SLOT)
    assert events[1] == ProtectionActivated(3, "a")


def testUnKOParBrulureDonneLaVictoireAuSurvivant():
    a, b = fighter("a", speed=90), fighter("b")
    battle = Battle(a, b)
    a.status, a.hp = StatusCondition.BURN, 1
    events = play(battle, Rolls(), SWORDS_DANCE_SLOT, SWORDS_DANCE_SLOT)
    assert events[-3:] == (BurnDamage(1, "a", 1, 0), KnockedOut(1, "a"), BattleEnded(1, "b"))
    assert battle.winner == "b"
    assert battle.is_over


def testUnDoubleKOTermineLeCombatSurUnMatchNul():
    a, b = fighter("a", speed=90), fighter("b")
    battle = Battle(a, b)
    a.status = b.status = StatusCondition.BURN
    a.hp = b.hp = 1
    events = play(battle, Rolls(), SWORDS_DANCE_SLOT, SWORDS_DANCE_SLOT)
    assert events[-5:] == (
        BurnDamage(1, "a", 1, 0), KnockedOut(1, "a"),
        BurnDamage(1, "b", 1, 0), KnockedOut(1, "b"),
        BattleEnded(1, None),
    )
    assert battle.is_over
    assert battle.winner is None
    with pytest.raises(ValueError, match="already ended"):
        BattleEngine(Rolls()).play_turn(battle, 0, 0)


def testUnCombatEnCoursNEstNiTermineNiGagne():
    battle = Battle(fighter("a"), fighter("b"))
    assert not battle.is_over
    assert battle.winner is None
