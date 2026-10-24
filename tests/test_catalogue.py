from datetime import date

from fastapi.testclient import TestClient

from pokemon_battle.api.app import create_app
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.application.pokemon_catalogue import catalogue_data


def testLeCatalogueExposeToutesLesEspecesSansStatistiquesDeCombat(tmp_path):
    """Le front reçoit un catalogue complet et documenté, pas un moteur de calcul."""
    with TestClient(create_app(tmp_path / "battles.sqlite3")) as client:
        response = client.get("/catalogue")
    assert response.status_code == 200
    data = response.json()
    assert len(data["species"]) == 1025
    assert len(data["generations"]) == 9
    assert len(data["types"]) == 18
    assert len({item["id"] for item in data["species"]}) == 1025
    assert all("stats" not in item and "attacks" not in item for item in data["species"])
    assert all(item["key"] in CATALOG for item in data["species"])
    assert data["source"].startswith("https://github.com/PokeAPI/pokeapi/tree/")


def testLesMetadonneesDeClassementSontCoherentes():
    """Types, catégories, générations et versions proviennent des relations PokéAPI."""
    data = catalogue_data()
    species = {item["id"]: item for item in data["species"]}
    assert species[25]["name"] == "Pikachu"
    assert species[25]["types"] == ["electric"]
    assert species[150]["legendary"] is True
    assert species[151]["mythical"] is True
    assert species[172]["baby"] is True
    assert species[1025]["generation"] == 9
    versions = {item["id"]: item for item in data["versions"]}
    assert versions[28]["release_date"] == "1996-02-27"
    assert versions[25]["release_date"] == "2022-11-18"
    assert versions[30]["release_date"] == "2025-10-16"
    assert all(date.fromisoformat(version["release_date"]) for version in versions.values())
    assert all(set(item["versions"]) <= versions.keys() for item in species.values())
    assert species[25]["generation"] == 1
    assert 28 in species[25]["versions"]


def testChaqueEspecePossedeUneDefinitionValideEtDesAttaquesJouables():
    """Aucune entrée du sélecteur ne doit échouer par manque de données métier."""
    for item in catalogue_data()["species"]:
        species = CATALOG[item["key"]]
        assert species.name == item["name"]
        assert 1 <= len(species.attacks) <= 4
        assert species.stats.hp >= 1
        assert all(attack.max_pp > 0 for attack in species.attacks)
    assert CATALOG["bulbasaur"] == CATALOG["bulbizarre"]
    assert CATALOG["charmander"] == CATALOG["salameche"] == CATALOG["salamèche"]


def testUnCombatDeDeuxNouvellesEspecesPeutEtreJoue(tmp_path):
    """La sélection d'une espèce hors démonstration reste branchée à FastAPI."""
    from uuid import uuid4
    with TestClient(create_app(tmp_path / "battles.sqlite3")) as client:
        created = client.post("/battles", json={"first_species": "pikachu", "second_species": "mewtwo"})
        assert created.status_code == 201
        battle = created.json()
        assert battle["first"]["species"] == "Pikachu"
        assert battle["second"]["species"] == "Mewtwo"
        response = client.post(f"/battles/{battle['id']}/turns", json={
            "first_move": 0, "second_move": 0, "expected_turn": 0, "idempotency_key": str(uuid4()),
        })
        assert response.status_code == 200
        assert response.json()["battle"]["turn"] == 1
