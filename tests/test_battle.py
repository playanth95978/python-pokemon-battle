from dataclasses import FrozenInstanceError
from fractions import Fraction
from random import Random

import pytest

from pokemon_battle import (
    Attack, AttackMissed, AttackUsed, Battle, BattleEnded, BattleEngine,
    Category, DamageDealt, Fighter, KnockedOut, Species, Stats, Type, effectiveness,
)


class Rolls:
    def __init__(self, *values):
        self.values = iter(values)

    def randint(self, a, b):
        value = next(self.values)
        assert a <= value <= b
        return value


def fighter(id, speed=73, hp=251, attack=None, types=(Type.NORMAL,)):
    return Fighter(id, Species(id, types, Stats(hp, 101, 89, 127, 97, speed),
                               (attack or Attack("Tackle", Type.NORMAL, 40, 100, 3),)))


def testLesDefinitionsSontImmuablesEtLesEtatsIndependants():
    """Partager une espèce ne doit partager ni PV ni PP."""
    first = fighter("a")
    second = Fighter("b", first.species)
    first.pp[0] = 0
    first.hp = 1
    assert second.pp == [3]
    assert second.hp == 251
    with pytest.raises(FrozenInstanceError):
        first.species.name = "changed"
    with pytest.raises(FrozenInstanceError):
        first.species.attacks[0].power = 99


def testLePlusRapideJoueEnPremierAvecDegatsExacts():
    """La formule entière et les événements doivent rester reproductibles."""
    battle = Battle(fighter("a", speed=61), fighter("b", speed=83))
    events = BattleEngine(Rolls(1, 100, 1, 85)).play_turn(battle, 0, 0)
    assert events == (
        AttackUsed(1, "b", "a", "Tackle", 2),
        DamageDealt(1, "b", "a", 31, 220, Fraction(1)),
        AttackUsed(1, "a", "b", "Tackle", 2),
        DamageDealt(1, "a", "b", 26, 225, Fraction(1)),
    )


@pytest.mark.parametrize("tie,actor", [(0, "a"), (1, "b")])
def testLesEgalitesDeVitesseUtilisentLeHasardInjecte(tie, actor):
    """Les deux résultats du tirage choisissent chacun un combattant."""
    battle = Battle(fighter("a"), fighter("b"))
    events = BattleEngine(Rolls(tie, 1, 100, 1, 100)).play_turn(battle, 0, 0)
    assert events[0].actor == actor


@pytest.mark.parametrize("roll,missed", [(72, False), (73, True)])
def testLaPrecisionInclutSaBorneEtConsommeUnPp(roll, missed):
    """Un échec de précision consomme aussi un PP."""
    move = Attack("Slam", Type.NORMAL, 46, 72, 5)
    battle = Battle(fighter("a", speed=91, attack=move), fighter("b"))
    rolls = (roll, 1, 100) if missed else (roll, 100, 1, 100)
    events = BattleEngine(Rolls(*rolls)).play_turn(battle, 0, 0)
    assert isinstance(events[1], AttackMissed) is missed
    assert battle.first.pp == [4]


@pytest.mark.parametrize("attack,defenders,expected", [
    (Type.FIRE, (Type.GRASS, Type.STEEL), Fraction(4)),
    (Type.FIRE, (Type.WATER, Type.DRAGON), Fraction(1, 4)),
    (Type.FIRE, (Type.GRASS, Type.WATER), Fraction(1)),
    (Type.ELECTRIC, (Type.WATER, Type.GROUND), Fraction(0)),
    (Type.DRAGON, (Type.FAIRY,), Fraction(0)),
])
def testLesTypesSeCombinent(attack, defenders, expected):
    """Les doubles types multiplient les effets, immunités comprises."""
    assert effectiveness(attack, defenders) == expected


def testUneImmuniteNeRetireAucunPv():
    """L'immunité reste zéro malgré le minimum d'un point de dégât."""
    battle = Battle(fighter("a", speed=99), fighter("b", types=(Type.GHOST,)))
    events = BattleEngine(Rolls(1, 1, 100)).play_turn(battle, 0, 0)
    assert events[1] == DamageDealt(1, "a", "b", 0, 251, Fraction(0))


def testLeKoInterromptLeTourEtTermineLeCombat():
    """Le perdant ne riposte pas et ses PV ne deviennent jamais négatifs."""
    battle = Battle(fighter("a", speed=88), fighter("b", hp=7))
    engine = BattleEngine(Rolls(1, 100))
    events = engine.play_turn(battle, 0, 0)
    assert events[1] == DamageDealt(1, "a", "b", 7, 0, Fraction(1))
    assert events[-2:] == (KnockedOut(1, "b"), BattleEnded(1, "a"))
    assert battle.second.pp == [3]
    assert battle.winner == "a"
    with pytest.raises(ValueError, match="ended"):
        engine.play_turn(battle, 0, 0)


@pytest.mark.parametrize("index", [-1, 1, True])
def testUnChoixInvalideNeModifiePasLeCombat(index):
    """Même le second choix est validé avant la première attaque."""
    battle = Battle(fighter("a"), fighter("b"))
    with pytest.raises(ValueError, match="slot"):
        BattleEngine(Rolls()).play_turn(battle, 0, index)
    assert battle.turn == 0
    assert battle.first.pp == [3]
    assert battle.first.hp == 251


def testUneAttaqueEpuiseeEstRefusee():
    """Le moteur refuse le tour sans consommer le PP adverse."""
    battle = Battle(fighter("a"), fighter("b"))
    battle.second.pp[0] = 0
    with pytest.raises(ValueError, match="PP"):
        BattleEngine(Rolls()).play_turn(battle, 0, 0)
    assert battle.first.pp == [3]
    assert battle.turn == 0


def testLesAttaquesSpecialesUtilisentLesStatsSpeciales():
    """Une attaque spéciale utilise l'attaque spéciale et la défense spéciale."""
    move = Attack("Beam", Type.NORMAL, 53, 100, 4, Category.SPECIAL)
    battle = Battle(fighter("a", speed=94, attack=move), fighter("b"))
    events = BattleEngine(Rolls(1, 100, 1, 100)).play_turn(battle, 0, 0)
    assert events[1].damage == 48


def testUneGraineReproduitLeCombat():
    """Deux moteurs indépendants reproduisent événements et état final."""
    def run():
        battle = Battle(fighter("a"), fighter("b"))
        events = BattleEngine(Random(871)).play_turn(battle, 0, 0)
        return events, battle
    assert run() == run()


@pytest.mark.parametrize("kwargs", [{"power": 0}, {"accuracy": 101}, {"max_pp": -1}])
def testLesDefinitionsInvalidesSontRefusees(kwargs):
    """Les valeurs invalides sont rejetées à la frontière du domaine."""
    values = dict(name="Test", type=Type.WATER, power=37, accuracy=92, max_pp=11)
    values.update(kwargs)
    with pytest.raises(ValueError):
        Attack(**values)
