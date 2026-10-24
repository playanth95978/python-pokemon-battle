import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from threading import Barrier
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from pokemon_battle.api.app import create_app
from pokemon_battle.application.battle_service import BattleService
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.engine import BattleEngine
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository


@pytest.fixture
def context(tmp_path):
    path = tmp_path / "battles.sqlite3"
    app = create_app(path)
    with TestClient(app) as client:
        record = app.state.battle_service.create_battle("bulbizarre", "carapuce")
        yield client, path, record


def payload(**changes):
    return {"first_move": 0, "second_move": 0, "expected_turn": 0,
            "idempotency_key": str(uuid4()), **changes}


def testLaRepetitionRetourneLaMemeReponseSansRejouer(context):
    """Une clé identique restitue aussi les événements, sans nouvel appel au moteur."""
    client, path, record = context
    body = payload()
    response = client.post(f"/battles/{record.id}/turns", json=body)
    assert response.status_code == 200
    before = SqliteBattleRepository(path).get(record.id)
    # Un nouvel objet moteur/repository prouve que le cache ne vit pas en mémoire.
    engine = Mock(spec=BattleEngine)
    service = BattleService(SqliteBattleRepository(path), CATALOG, engine)
    restored = service.play_turn(record.id, 0, 0, expected_turn=0,
                                idempotency_key=UUID(body["idempotency_key"]))
    engine.play_turn.assert_not_called()
    assert restored.record == before
    repeated = client.post(f"/battles/{record.id}/turns", json=body)
    assert repeated.status_code == 200
    assert repeated.json() == response.json()
    assert SqliteBattleRepository(path).get(record.id) == before


@pytest.mark.parametrize("changes", [{"first_move": 1}, {"second_move": 1}, {"expected_turn": 1}])
def testUneCleNePeutPasChangerDeContenu(context, changes):
    """Réutiliser une clé pour un autre choix ou tour produit 409 sans écriture."""
    client, path, record = context
    body = payload()
    assert client.post(f"/battles/{record.id}/turns", json=body).status_code == 200
    before = SqliteBattleRepository(path).get(record.id)
    assert client.post(f"/battles/{record.id}/turns", json={**body, **changes}).status_code == 409
    assert SqliteBattleRepository(path).get(record.id) == before


def testUneAncienneReponseResteDisponibleApresUnAutreTour(context):
    """Une répétition renvoie l'instantané initial sans faire reculer le combat enregistré."""
    client, path, record = context
    body = payload()
    first = client.post(f"/battles/{record.id}/turns", json=body)
    assert client.post(f"/battles/{record.id}/turns", json=payload(expected_turn=1)).status_code == 200
    assert client.post(f"/battles/{record.id}/turns", json=body).json() == first.json()
    assert SqliteBattleRepository(path).get(record.id).battle.turn == 2


def testUneReponseDeKoEstRejouable(context):
    """La recherche de clé précède le refus des combats terminés."""
    client, path, record = context
    repository = SqliteBattleRepository(path)
    record.battle.second.hp = 1
    repository.save(record)
    body = payload()
    first = client.post(f"/battles/{record.id}/turns", json=body)
    assert first.status_code == 200
    assert first.json()["events"][-1]["type"] == "battle_ended"
    second = client.post(f"/battles/{record.id}/turns", json=body)
    assert second.status_code == 200
    assert second.json() == first.json()


@pytest.mark.parametrize("same_key", [True, False])
def testDeuxRequetesHttpSimultaneesExecutentUnSeulTour(context, same_key):
    """Deux instances FastAPI partagent la garantie SQLite, sans verrou Python commun."""
    client, path, record = context
    body = payload()
    barrier = Barrier(2)
    # Chaque client possède son propre service, moteur et ses propres connexions SQLite.
    with TestClient(create_app(path)) as other:
        def submit(index):
            barrier.wait(timeout=5)
            return (client if index == 0 else other).post(
                f"/battles/{record.id}/turns",
                json=body if index == 0 or same_key else {**body, "idempotency_key": str(uuid4())},
            )
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(submit, (0, 1)))
    assert sorted(response.status_code for response in responses) == ([200, 200] if same_key else [200, 409])
    if same_key:
        assert responses[0].json() == responses[1].json()
    saved = SqliteBattleRepository(path).get(record.id)
    assert saved.battle.turn == 1
    assert saved.battle.first.pp == [34, 25]
    assert saved.battle.second.pp == [34, 25]
    with closing(sqlite3.connect(path)) as connection:
        assert connection.execute("SELECT COUNT(*) FROM battle_turns").fetchone()[0] == 1


def testLEchecDuRecuAnnuleAussiLaSauvegardeDuCombat(context):
    """État et reçu sont atomiques ; une nouvelle tentative peut ensuite réussir."""
    _, path, record = context
    app = create_app(path)
    body = payload()
    with closing(sqlite3.connect(path)) as connection:
        with connection:
            connection.execute("""
                CREATE TRIGGER refuse_receipt BEFORE INSERT ON battle_turns
                BEGIN SELECT RAISE(ABORT, 'Reçu refusé'); END
            """)
    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.post(f"/battles/{record.id}/turns", json=body).status_code == 500
        assert SqliteBattleRepository(path).get(record.id) == record
        with closing(sqlite3.connect(path)) as connection:
            assert connection.execute("SELECT COUNT(*) FROM battle_turns").fetchone()[0] == 0
            with connection:
                connection.execute("DROP TRIGGER refuse_receipt")
        assert client.post(f"/battles/{record.id}/turns", json=body).status_code == 200
        assert SqliteBattleRepository(path).get(record.id).battle.turn == 1


@pytest.mark.parametrize("changes", [
    {"expected_turn": -1}, {"expected_turn": True}, {"expected_turn": None},
    {"idempotency_key": "invalide"}, {"idempotency_key": None},
])
def testLesMetadonneesInvalidesSontRefusees(context, changes):
    """Le contrat HTTP rejette les tours invalides et les clés non UUID."""
    client, path, record = context
    assert client.post(f"/battles/{record.id}/turns", json=payload(**changes)).status_code == 422
    assert SqliteBattleRepository(path).get(record.id) == record


def testLesMetadonneesSontObligatoires(context):
    """Les anciens clients doivent fournir la précondition et la clé."""
    client, _, record = context
    assert client.post(f"/battles/{record.id}/turns", json={"first_move": 0, "second_move": 0}).status_code == 422


def testLaTableDeRecusSAjouteSansEffacerLesCombats(tmp_path):
    """Le démarrage met à niveau une base existante sans toucher à ses lignes."""
    path = tmp_path / "existing.sqlite3"
    with closing(sqlite3.connect(path)) as connection:
        with connection:
            connection.execute("CREATE TABLE battles (id TEXT PRIMARY KEY NOT NULL, snapshot TEXT NOT NULL)")
            connection.execute("INSERT INTO battles VALUES ('ancien', '{}')")
    repository = SqliteBattleRepository(path)
    repository.initialize()
    repository.initialize()
    with closing(sqlite3.connect(path)) as connection:
        assert connection.execute("SELECT id, snapshot FROM battles").fetchall() == [('ancien', '{}')]
        assert connection.execute("SELECT COUNT(*) FROM battle_turns").fetchone()[0] == 0
