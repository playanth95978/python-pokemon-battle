"""Import des attaques de statut PokéAPI : seuls les effets que le moteur sait appliquer entrent au catalogue."""

import importlib.util
from pathlib import Path

import pytest

from pokemon_battle.application.catalog import IMPORTED_CATALOG
from pokemon_battle.domain import Category

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "import_pokeapi.py"
_spec = importlib.util.spec_from_file_location("import_pokeapi", SCRIPT)
importer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(importer)

TYPES = {1: "normal", 5: "ground", 10: "fire", 12: "grass", 13: "electric", 14: "psychic"}
NAMES = {86: {"name": "Cage Éclair"}, 14: {"name": "Danse Lames"}, 45: {"name": "Rugissement"},
         182: {"name": "Abri"}, 261: {"name": "Feu Follet"}}


def move(id, type_id, pp, accuracy, target_id, effect_id, priority="0", damage_class_id="1", power=""):
    """Ligne de moves.csv, avec les mêmes chaînes que le fichier officiel."""
    return {"id": str(id), "identifier": f"move-{id}", "type_id": str(type_id), "power": power, "pp": str(pp),
            "accuracy": accuracy, "priority": priority, "target_id": str(target_id),
            "damage_class_id": damage_class_id, "effect_id": str(effect_id)}


def meta(category, ailment="0", ailment_chance="0", stat_chance="0"):
    """Ligne de move_meta.csv réduite aux colonnes utiles."""
    return {"meta_category_id": category, "meta_ailment_id": ailment,
            "ailment_chance": ailment_chance, "stat_chance": stat_chance}


def convert(row, meta_row, changes=()):
    return importer.status_attack(row, meta_row, list(changes), TYPES, NAMES)


def testCageEclairDevientUneParalysieSurLAdversaire():
    assert convert(move(86, 13, 20, "90", 10, 68), meta("1", "1")) == {
        "name": "Cage Éclair", "type": "electric", "power": None, "accuracy": 90, "max_pp": 20,
        "category": "status", "target": "opponent", "priority": 0,
        "effects": [{"effect_type": "apply_status", "condition": "paralysis"}],
    }


def testFeuFolletDevientUneBrulure():
    attack = convert(move(261, 10, 15, "85", 10, 168), meta("1", "4"))
    assert attack["effects"] == [{"effect_type": "apply_status", "condition": "burn"}]


def testDanseLamesViseSonLanceurSansTestDePrecision():
    attack = convert(move(14, 1, 20, "", 7, 51), meta("2"), [(2, 2)])
    assert (attack["target"], attack["accuracy"]) == ("self", None)
    assert attack["effects"] == [{"effect_type": "modify_stat", "stat": "attack", "stages": 2}]


def testRugissementVisantTousLesAdversairesViseLAdversaireEnDuel():
    attack = convert(move(45, 1, 40, "100", 11, 19), meta("2"), [(2, -1)])
    assert attack["target"] == "opponent"
    assert attack["effects"] == [{"effect_type": "modify_stat", "stat": "attack", "stages": -1}]


def testAbriGardeSaPrioriteEtProtegeSonLanceur():
    attack = convert(move(182, 1, 10, "", 7, 112, priority="4"), meta("13", "43"))
    assert (attack["target"], attack["priority"], attack["accuracy"]) == ("self", 4, None)
    assert attack["effects"] == [{"effect_type": "protect"}]


@pytest.mark.parametrize("row,meta_row,changes", [
    (move(79, 12, 15, "75", 10, 2), meta("1", "2"), ()),  # Poudre Dodo : sommeil non géré.
    (move(28, 5, 15, "100", 10, 24), meta("2"), [(7, -1)]),  # Jet de Sable : précision non gérée.
    (move(104, 1, 15, "", 7, 17), meta("2"), [(8, 1)]),  # Reflet : esquive non gérée.
    (move(109, 1, 10, "100", 10, 50), meta("1", "6"), ()),  # Ultrason : confusion non gérée.
    (move(207, 1, 15, "85", 10, 119), meta("5", "6"), [(2, 2)]),  # Vantardise : effets mêlés.
    (move(84, 13, 30, "100", 10, 7, damage_class_id="3", power="40"), meta("4", "1", "10"), ()),
    (move(100, 14, 20, "", 13, 53), meta("2"), [(6, 2)]),  # Cible « lanceur et alliés » hors duel.
    (move(86, 13, 20, "90", 10, 68), None, ()),  # Méta absente : effet inconnu.
])
def testUnEffetNonGereNEntrePasAuCatalogue(row, meta_row, changes):
    assert convert(row, meta_row, changes) is None


def testLeCatalogueImporteDesKitsJouablesAvecAuPlusUneAttaqueDeStatut():
    """Chaque kit garde au moins une attaque à dégâts, pour qu'un combat puisse se terminer."""
    with_status = 0
    for species in {species.name: species for species in IMPORTED_CATALOG.values()}.values():
        status = [attack for attack in species.attacks if attack.category == Category.STATUS]
        assert len(species.attacks) <= 4
        assert len(status) <= 1
        assert any(attack.deals_damage for attack in species.attacks)
        with_status += bool(status)
    assert with_status >= 100
