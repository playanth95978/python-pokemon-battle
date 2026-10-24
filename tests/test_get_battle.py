from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from pokemon_battle.api.app import create_app
from pokemon_battle.application.battle_service import BattleService
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository


def testLeServiceLitLeCombatSansConsulterLeCatalogue(tmp_path):
    """Un combat sauvegardé reste consultable même sans catalogue d'espèces."""
    repository = SqliteBattleRepository(tmp_path / "battles.sqlite3")
    repository.initialize()
    record = BattleService(repository, CATALOG).create_battle("bulbizarre", "carapuce")
    assert BattleService(repository, {}).get_battle(record.id) == record


def testLeGetRetourneLeCombatSansModifierLaBase(tmp_path):
    """Une consultation restitue l'état sauvegardé sans changer le tour, les PV ni les PP."""
    path = tmp_path / "battles.sqlite3"
    with TestClient(create_app(path)) as client:
        created = client.post("/battles", json={
            "first_species": "bulbizarre", "second_species": "salameche",
        }).json()
        repository = SqliteBattleRepository(path)
        record = repository.get(UUID(created["id"]))
        record.battle.first.hp = 87
        record.battle.first.pp[1] = 19
        record.battle.turn = 3
        repository.save(record)
        before = path.read_bytes()
        response = client.get(f"/battles/{record.id}")
        assert response.status_code == 200
        expected = {**created, "turn": 3}
        expected["first"]["hp"] = 87
        expected["first"]["attacks"][1]["pp"] = 19
        assert response.json() == expected
        assert repository.get(record.id) == record
        assert path.read_bytes() == before


def testLeGetRetourne404PourUnCombatAbsent(tmp_path):
    """Un UUID valide mais inconnu donne une erreur HTTP 404."""
    with TestClient(create_app(tmp_path / "battles.sqlite3")) as client:
        response = client.get(f"/battles/{uuid4()}")
    assert response.status_code == 404
    assert response.json() == {"detail": "Le combat n'existe pas"}


@pytest.mark.parametrize("identifier", ["invalide", "a" * 201])
def testLeGetRefuseUnIdentifiantMalForme(tmp_path, identifier):
    """La validation UUID de FastAPI suffit, y compris pour une chaîne longue."""
    with TestClient(create_app(tmp_path / "battles.sqlite3")) as client:
        assert client.get(f"/battles/{identifier}").status_code == 422


def testLeGetRetourneLeVainqueurDUnCombatTermine(tmp_path):
    """Un combat terminé reste consultable avec le vainqueur enregistré."""
    path = tmp_path / "battles.sqlite3"
    with TestClient(create_app(path)) as client:
        repository = SqliteBattleRepository(path)
        record = BattleService(repository, CATALOG).create_battle("carapuce", "salameche")
        record.battle.second.hp = 0
        record.battle.turn = 5
        repository.save(record)
        response = client.get(f"/battles/{record.id}")
    assert response.status_code == 200
    assert response.json()["winner"] == record.battle.first.id
    assert response.json()["second"]["hp"] == 0
    assert response.json()["turn"] == 5
