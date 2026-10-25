"""Noms explicites des actions et compatibilité des anciennes données."""

import json
from uuid import uuid4

import pytest

from pokemon_battle.api.schemas import AiDecisionResponse
from pokemon_battle.application.ai.tools import SelectAttackRequest
from pokemon_battle.application.battle_service import BattleService
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.domain import AttackAction, UsePotionAction
from pokemon_battle.infrastructure.sqlite_battle_repository import (
    SqliteBattleRepository, _serialize_action, _deserialize_action,
)


@pytest.mark.parametrize("action, data", [
    (AttackAction(attack_slot=1), {"action_type": "attack", "attack_slot": 1}),
    (UsePotionAction(), {"action_type": "potion"}),
])
def testLesActionsUtilisentLesNomsExplicitesDansLeJson(action, data):
    """Le type d'action et l'emplacement d'attaque doivent être conservés à l'aller-retour."""
    assert _serialize_action(action) == data
    assert _deserialize_action(data) == action


@pytest.mark.parametrize("data, expected", [
    ({"kind": "attack", "slot": 0}, AttackAction(attack_slot=0)),
    ({"kind": "potion"}, UsePotionAction()),
])
def testLesAnciensNomsRestentLisibles(data, expected):
    """Renommer les clés ne doit pas empêcher de lire un ancien instantané."""
    assert _deserialize_action(data) == expected


@pytest.mark.parametrize("attack_slot", [None, True, "0", -1, 4])
def testUnEmplacementEnregistreInvalideEstRefuse(attack_slot):
    """Les données persistées ne doivent pas convertir silencieusement un emplacement invalide."""
    with pytest.raises(ValueError, match="Emplacement"):
        _deserialize_action({"action_type": "attack", "attack_slot": attack_slot})


def testUnTypeDActionInconnuEstRefuse():
    """Une future action non prise en charge ne doit pas être transformée en potion."""
    with pytest.raises(ValueError, match="inconnue"):
        _deserialize_action({"action_type": "unknown"})


def testLesAnciensArgumentsDUnOutilRestentValidesMaisLeSchemaEstExplicite():
    """Une conversation déjà créée peut utiliser l'ancien argument sans changer les nouveaux schémas."""
    assert SelectAttackRequest.model_validate({"slot": 1}).attack_slot == 1
    assert SelectAttackRequest.model_validate({"attack_slot": 1}).attack_slot == 1
    assert "attack_slot" in SelectAttackRequest.model_json_schema()["properties"]
    assert "slot" not in SelectAttackRequest.model_json_schema()["properties"]


def testUneAncienneDecisionEstExposeeAvecLeNouveauNom():
    """Rejouer un ancien reçu IA doit produire la même structure que les nouvelles décisions HTTP."""
    response = AiDecisionResponse.model_validate({"slot": 1, "source": "llm", "comment": "", "fallback_reason": None})
    assert response.model_dump() == {"action_type": "attack", "attack_slot": 1, "source": "llm", "comment": "", "fallback_reason": None}


def testUnAncienRecuAvecSeulementDesEntiersResteIdempotent(tmp_path):
    """L'absence des actions JSON doit utiliser les anciennes colonnes sans rejouer le combat."""
    repository = SqliteBattleRepository(tmp_path / "legacy.sqlite3")
    repository.initialize()
    service = BattleService(repository, CATALOG)
    record = service.create_battle("pikachu", "charmander")
    key = uuid4()
    result = service.play_turn(record.id, 0, 1, expected_turn=0, idempotency_key=key)
    with repository.transaction() as session:
        row = session.connection.execute("SELECT result FROM battle_turns").fetchone()
        data = json.loads(row[0])
        data.pop("first_action")
        data.pop("second_action")
        session.connection.execute("UPDATE battle_turns SET result = ?", (json.dumps(data),))
    restored = service.play_turn(record.id, 0, 1, expected_turn=0, idempotency_key=key)
    assert restored == result
    assert repository.get(record.id).battle.turn == 1
