"""Contrats HTTP des potions et rejeu des commandes sans double consommation."""

from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from pokemon_battle.api.app import create_app


@pytest.fixture
def context(tmp_path):
    app = create_app(tmp_path / "potions.sqlite3")
    with TestClient(app) as client:
        service = app.state.battle_service
        record = service.create_battle("pikachu", "charmander")
        record.battle.first.hp = 50
        service.repository.save(record)
        yield client, service, record


def command(**changes):
    return {"first_action": {"action_type": "potion"},
            "second_action": {"action_type": "attack", "attack_slot": 0},
            "expected_turn": 0, "idempotency_key": str(uuid4()), **changes}


def testLaPotionHttpEstSauvegardeeEtRejouable(context):
    """Le reçu HTTP conserve le soin et empêche une deuxième consommation avec la même clé."""
    client, service, record = context
    body = command()
    url = f"/battles/{record.id}/turns"
    response = client.post(url, json=body)
    assert response.status_code == 200
    result = response.json()
    assert result["events"][0] == {"type": "potion_used", "turn": 1, "actor": record.battle.first.id,
                                    "healed": 20, "hp_remaining": 70, "potions_remaining": 1}
    assert result["battle"]["first"]["potions"] == 1
    assert result["battle"]["first"]["attacks"][0]["pp"] == 30
    assert client.post(url, json=body).json() == result
    changed = {**body, "first_action": {"action_type": "attack", "attack_slot": 0}}
    assert client.post(url, json=changed).status_code == 409
    assert service.get_battle(record.id).battle.first.potions == 1


@pytest.mark.parametrize("hp, potions", [(110, 2), (50, 0)])
def testUnePotionIndisponibleEstRefuseeSansJouerLeTour(context, hp, potions):
    """Les boutons désactivés ne remplacent pas la validation serveur des PV et du stock."""
    client, service, record = context
    record.battle.first.hp = record.battle.first.species.stats.hp if hp == 110 else hp
    record.battle.first.potions = potions
    service.repository.save(record)
    response = client.post(f"/battles/{record.id}/turns", json=command())
    assert response.status_code == 400
    saved = service.get_battle(record.id)
    assert saved.battle.turn == 0
    assert saved.battle.first.potions == potions


@pytest.mark.parametrize("action", [
    {"action_type": "potion", "attack_slot": 0},
    {"action_type": "attack", "attack_slot": True},
    {"action_type": "unknown"},
])
def testUneActionHttpMalformeeEstRefusee(context, action):
    """L'union discriminée refuse les champs inutiles, booléens et types inconnus."""
    client, _, record = context
    assert client.post(f"/battles/{record.id}/turns", json=command(first_action=action)).status_code == 422
