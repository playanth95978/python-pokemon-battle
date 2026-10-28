import sqlite3
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from pokemon_battle.api.app import create_app
from pokemon_battle.application.battle_service import BattleService, UnknownSpeciesError
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository


@pytest.fixture
def database(tmp_path):
    return tmp_path / "test.sqlite3"


def testLePostCreeUnCombatPersistant(database):
    """La réponse 201 correspond à un combat relisible depuis une autre connexion."""
    with TestClient(create_app(database)) as client:
        response = client.post("/battles", json={
            "first_species": "bulbizarre", "second_species": "salameche",
        })
    assert response.status_code == 201
    data = response.json()
    assert data["turn"] == 0
    assert data["winner"] is None
    assert data["is_over"] is False
    assert data["first"]["species"] == "Bulbizarre"
    assert data["first"]["hp"] == data["first"]["max_hp"] == 120
    assert data["second"]["hp"] == 114
    assert data["first"]["attacks"] == [
        {"attack_slot": 0, "name": "Charge", "pp": 35, "max_pp": 35,
         "category": "physical", "priority": 0, "target": "opponent"},
        {"attack_slot": 1, "name": "Fouet Lianes", "pp": 25, "max_pp": 25,
         "category": "physical", "priority": 0, "target": "opponent"},
    ]
    assert data["first"]["status"] is None
    assert data["first"]["stat_stages"] == {
        "attack": 0, "defense": 0, "special_attack": 0, "special_defense": 0, "speed": 0,
    }
    record = SqliteBattleRepository(database).get(UUID(data["id"]))
    assert record is not None
    assert record.battle.first.id == data["first"]["id"]
    assert record.battle.second.species == CATALOG["salameche"]
    assert record.battle.first.pp == [35, 25]


def testUneEspeceInconnueNeCreeAucuneLigne(database):
    """L'erreur métier est traduite en 400 sans écriture partielle."""
    with TestClient(create_app(database)) as client:
        response = client.post("/battles", json={
            "first_species": "bulbizarre", "second_species": "inconnu",
        })
    assert response.status_code == 400
    assert response.json() == {"detail": "Espèce inconnue : inconnu"}
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM battles").fetchone()[0] == 0


@pytest.mark.parametrize("body", [
    {}, {"first_species": " ", "second_species": "carapuce"},
    {"first_species": "carapuce", "second_species": "carapuce", "hp": 999},
    {"first_species": "carapuce", "second_species": "carapuce", "first_level": 101},
    {"first_species": "carapuce", "second_species": "carapuce", "first_potions": -1},
    {"first_species": "carapuce", "second_species": "carapuce", "first_potions": "3"},
])
def testLesRequetesInvalidesSontRefusees(database, body):
    """FastAPI valide la forme de la requête avant le service."""
    with TestClient(create_app(database)) as client:
        assert client.post("/battles", json=body).status_code == 422


def testDeuxCombattantsDeMemeEspeceRestentIndependants(database):
    """Les identités et les ressources restent propres à chaque combattant."""
    repository = SqliteBattleRepository(database)
    repository.initialize()
    record = BattleService(repository, CATALOG).create_battle(" Carapuce ", "CARAPUCE")
    assert record.battle.first.id != record.battle.second.id
    record.battle.first.pp[0] = 2
    assert record.battle.second.pp == [35, 25]
    assert repository.get(uuid4()) is None


def testLeRepositoryRelitUnEtatModifieEtTermine(database):
    """Le stockage conserve PV, PP, tour et définitions complètes après mise à jour."""
    repository = SqliteBattleRepository(database)
    repository.initialize()
    record = BattleService(repository, CATALOG).create_battle("bulbizarre", "carapuce")
    record.battle.second.hp = 0
    record.battle.first.pp[1] = 21
    record.battle.turn = 4
    repository.save(record)
    restored = SqliteBattleRepository(database).get(record.id)
    assert restored == record
    assert restored.battle.winner == record.battle.first.id


def testLeServicePropageLesErreursDeStockage():
    """Une panne d'écriture ne doit jamais devenir un faux succès."""
    class FailingRepository:
        def save(self, record):
            raise sqlite3.OperationalError("Écriture impossible")

    service = BattleService(FailingRepository(), CATALOG)
    with pytest.raises(sqlite3.OperationalError, match="Écriture impossible"):
        service.create_battle("bulbizarre", "carapuce")
    with pytest.raises(UnknownSpeciesError):
        service.create_battle("absent", "carapuce")


def testLesBonusDuDresseurNeConcernentQueLePremierCombattant(database):
    """Niveau et potions gagnés en exploration : appliqués au premier combattant et sauvegardés."""
    with TestClient(create_app(database)) as client:
        response = client.post("/battles", json={
            "first_species": "pikachu", "second_species": "salameche", "first_level": 55, "first_potions": 5,
        })
    assert response.status_code == 201
    data = response.json()
    assert (data["first"]["level"], data["first"]["potions"]) == (55, 5)
    assert (data["second"]["level"], data["second"]["potions"]) == (50, 2)
    record = SqliteBattleRepository(database).get(UUID(data["id"]))
    assert (record.battle.first.level, record.battle.first.potions) == (55, 5)
