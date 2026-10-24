import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from pokemon_battle.api.app import create_app
from pokemon_battle.application.battle_service import BattleService, InvalidMoveError, TurnConflictError
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.engine import BattleEngine
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository


class MaximumRolls:
    def randint(self, a, b):
        return b


def command(**overrides):
    return {"expected_turn": 0, "idempotency_key": str(uuid4()), **overrides}


@pytest.fixture
def context(tmp_path):
    path = tmp_path / "battles.sqlite3"
    app = create_app(path)
    with TestClient(app) as client:
        app.state.battle_service.engine = BattleEngine(MaximumRolls())
        created = client.post("/battles", json={
            "first_species": "bulbizarre", "second_species": "salameche",
        }).json()
        yield client, SqliteBattleRepository(path), UUID(created["id"])


def testUnTourRetourneLesEvenementsEtPersisteLesRessources(context):
    """Le tour HTTP applique le moteur puis expose le même état que le GET."""
    client, repository, battle_id = context
    response = client.post(f"/battles/{battle_id}/turns", json=command(first_move=1, second_move=1))
    assert response.status_code == 200
    data = response.json()
    assert data["battle"]["turn"] == 1
    # Flammèche : base 18 × STAB 1,5 × faiblesse 2 = 54.
    # Fouet Lianes : base 23 × STAB 1,5 × résistance 0,5, arrondi = 17.
    assert data["battle"]["first"]["hp"] == 66
    assert data["battle"]["second"]["hp"] == 97
    assert data["battle"]["first"]["attacks"][1]["pp"] == 24
    assert data["battle"]["second"]["attacks"][1]["pp"] == 24
    assert [event["type"] for event in data["events"]] == [
        "attack_used", "damage_dealt", "attack_used", "damage_dealt",
    ]
    assert data["events"][0]["actor"] == data["battle"]["second"]["id"]
    assert data["events"][0]["attack_type"] == "fire"
    assert data["events"][0]["attack_slot"] == 1
    assert data["events"][2]["attack_type"] == "grass"
    assert data["events"][1]["effectiveness"] == 2
    assert data["events"][3]["effectiveness"] == 0.5
    assert all(event["turn"] == 1 for event in data["events"])
    assert client.get(f"/battles/{battle_id}").json() == data["battle"]
    assert repository.get(battle_id).battle.turn == 1


@pytest.mark.parametrize("exhausted", [False, True])
def testUnMauvaisChoixRefuseLeTourSansModifierLaBase(context, exhausted):
    """Une attaque inexistante ou sans PP donne 400 sans jouer la première attaque."""
    client, repository, battle_id = context
    record = repository.get(battle_id)
    if exhausted:
        record.battle.second.pp[0] = 0
        repository.save(record)
    before = repository.get(battle_id)
    response = client.post(f"/battles/{battle_id}/turns", json={**command(),
        "first_move": 0, "second_move": 0 if exhausted else 3,
    })
    assert response.status_code == 400
    assert repository.get(battle_id) == before


def testLeKoEmpecheLaRiposteEtLesToursSuivants(context):
    """Le KO est enregistré, le perdant garde ses PP et un nouveau tour donne 409."""
    client, repository, battle_id = context
    record = repository.get(battle_id)
    record.battle.first.hp = 1
    repository.save(record)
    response = client.post(f"/battles/{battle_id}/turns", json=command(first_move=0, second_move=0))
    assert response.status_code == 200
    data = response.json()
    assert [event["type"] for event in data["events"]] == [
        "attack_used", "damage_dealt", "knocked_out", "battle_ended",
    ]
    assert data["events"][1]["damage"] == 1
    assert data["battle"]["first"]["hp"] == 0
    assert data["battle"]["first"]["attacks"][0]["pp"] == 35
    assert data["battle"]["winner"] == record.battle.second.id
    before = repository.get(battle_id)
    assert client.post(f"/battles/{battle_id}/turns", json={
        **command(expected_turn=1),
        "first_move": 0, "second_move": 0,
    }).status_code == 409
    assert repository.get(battle_id) == before


def testUnCombatAbsentDonne404(context):
    """Un UUID valide mais inconnu est distingué d'un choix invalide."""
    client, _, _ = context
    assert client.post(f"/battles/{uuid4()}/turns", json={
        **command(),
        "first_move": 0, "second_move": 0,
    }).status_code == 404


@pytest.mark.parametrize("body", [
    {}, {"first_move": -1, "second_move": 0},
    {"first_move": True, "second_move": 0},
    {"first_move": 0, "second_move": 4},
])
def testUnCorpsInvalideDonne422(context, body):
    """La validation HTTP rejette les indices mal formés sans modifier le combat."""
    client, repository, battle_id = context
    before = repository.get(battle_id)
    assert client.post(f"/battles/{battle_id}/turns", json={**command(), **body}).status_code == 422
    assert repository.get(battle_id) == before


def testUnUuidInvalideDonne422(context):
    """Le chemin est validé avant d'entrer dans le service."""
    client, _, _ = context
    assert client.post("/battles/invalide/turns", json={
        **command(),
        "first_move": 0, "second_move": 0,
    }).status_code == 422


def testUnePanneDeSauvegardeNePersistePasLeTour(tmp_path):
    """Une écriture refusée par SQLite produit 500 et conserve le dernier état valide."""
    path = tmp_path / "battles.sqlite3"
    app = create_app(path)
    with TestClient(app, raise_server_exceptions=False) as client:
        repository = SqliteBattleRepository(path)
        record = app.state.battle_service.create_battle("bulbizarre", "carapuce")
        before = repository.get(record.id)
        with closing(sqlite3.connect(path)) as connection:
            with connection:
                connection.execute("""
                    CREATE TRIGGER refuse_update BEFORE UPDATE ON battles
                    BEGIN SELECT RAISE(ABORT, 'Écriture refusée'); END
                """)
        assert client.post(f"/battles/{record.id}/turns", json={
            **command(),
            "first_move": 0, "second_move": 0,
        }).status_code == 500
        assert repository.get(record.id) == before


def testLaTransactionAnnuleUneEcritureAvantErreur(tmp_path):
    """Une exception après save annule la transaction entière."""
    repository = SqliteBattleRepository(tmp_path / "battles.sqlite3")
    repository.initialize()
    record = BattleService(repository, CATALOG).create_battle("bulbizarre", "carapuce")
    with pytest.raises(RuntimeError):
        with repository.transaction() as session:
            updated = session.get(record.id)
            updated.battle.turn = 7
            session.save(updated)
            raise RuntimeError("Annulation")
    assert repository.get(record.id) == record


def testDeuxToursConcurrentsNeSEcrasentPas(tmp_path):
    """Deux demandes du même tour avec des clés distinctes produisent un seul succès."""
    path = tmp_path / "battles.sqlite3"
    repository = SqliteBattleRepository(path)
    repository.initialize()
    record = BattleService(repository, CATALOG).create_battle("bulbizarre", "carapuce")

    def play(_):
        service = BattleService(SqliteBattleRepository(path), CATALOG, BattleEngine(MaximumRolls()))
        try:
            return service.play_turn(record.id, 0, 0, expected_turn=0, idempotency_key=uuid4()).record.battle.turn
        except TurnConflictError:
            return "conflit"

    with ThreadPoolExecutor(max_workers=2) as executor:
        turns = list(executor.map(play, range(2)))
    assert turns.count(1) == 1
    assert turns.count("conflit") == 1
    saved = repository.get(record.id)
    assert saved.battle.turn == 1
    assert saved.battle.first.pp == [34, 25]
    assert saved.battle.second.pp == [34, 25]


def testLeServiceValideLesIndicesSansLaCoucheHttp(context):
    """Le service refuse aussi un indice négatif appelé directement."""
    _, repository, battle_id = context
    before = repository.get(battle_id)
    with pytest.raises(InvalidMoveError):
        BattleService(repository, CATALOG).play_turn(battle_id, -1, 0, expected_turn=0, idempotency_key=uuid4())
    assert repository.get(battle_id) == before
