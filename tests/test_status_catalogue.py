"""Duel de démonstration Pikachu contre Salamèche avec des attaques de statut issues de PokéAPI."""

import asyncio
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from pokemon_battle.api.app import create_app
from pokemon_battle.application.ai.generation import ToolCall
from pokemon_battle.application.ai.opponent import LocalOpponent
from pokemon_battle.application.ai.tools import execute_tool
from pokemon_battle.application.ai.tools_context import ToolsContext
from pokemon_battle.application.battle_service import BattleService
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.domain import (
    ApplyStatus, BattleStat, Category, ModifyStat, Protect, StatusCondition, Target,
)
from pokemon_battle.engine import BattleEngine
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository


class Rolls:
    def __init__(self, *values):
        self.values = list(values)

    def randint(self, a, b):
        value = self.values.pop(0)
        assert a <= value <= b
        return value


def testPikachuEtSalamecheConnaissentLeursAttaquesDeStatutPokeApi():
    """Valeurs PokéAPI : Cage Éclair (90 %, 20 PP), Abri (+4, 10 PP), Feu Follet (85 %, 15 PP), Danse Lames (20 PP)."""
    pikachu, salameche = CATALOG["pikachu"], CATALOG["salameche"]
    assert [attack.name for attack in pikachu.attacks] == ["Éclair", "Souplesse", "Cage Éclair", "Abri"]
    assert [attack.name for attack in salameche.attacks] == ["Charge", "Flammèche", "Feu Follet", "Danse Lames"]

    thunder_wave, protect = pikachu.attacks[2:]
    assert (thunder_wave.category, thunder_wave.power, thunder_wave.accuracy, thunder_wave.max_pp) \
        == (Category.STATUS, None, 90, 20)
    assert thunder_wave.effects == (ApplyStatus(StatusCondition.PARALYSIS),)
    assert (protect.target, protect.priority, protect.accuracy, protect.max_pp) == (Target.SELF, 4, None, 10)
    assert protect.effects == (Protect(),)

    will_o_wisp, swords_dance = salameche.attacks[2:]
    assert (will_o_wisp.accuracy, will_o_wisp.max_pp, will_o_wisp.effects) \
        == (85, 15, (ApplyStatus(StatusCondition.BURN),))
    assert (swords_dance.target, swords_dance.accuracy, swords_dance.max_pp, swords_dance.effects) \
        == (Target.SELF, None, 20, (ModifyStat(BattleStat.ATTACK, 2),))
    assert CATALOG["charmander"] == salameche


def testUnDuelPikachuSalamecheParalyseEtBrule(tmp_path):
    """Pikachu (plus rapide) paralyse Salamèche, qui agit malgré tout et brûle Pikachu."""
    app = create_app(tmp_path / "battles.sqlite3")
    with TestClient(app) as client:
        # Précision de Cage Éclair, contrôle de paralysie réussi (Salamèche agit), précision de Feu Follet.
        app.state.battle_service.engine = BattleEngine(Rolls(1, 100, 1))
        battle = client.post("/battles", json={"first_species": "pikachu", "second_species": "salameche"}).json()
        response = client.post(f"/battles/{battle['id']}/turns", json={
            "first_move": 2, "second_move": 2, "expected_turn": 0, "idempotency_key": str(uuid4()),
        })
    assert response.status_code == 200
    data = response.json()
    pikachu = data["battle"]["first"]
    assert [event["type"] for event in data["events"]] == [
        "attack_used", "status_applied", "attack_used", "status_applied", "burn_damage",
    ]
    assert data["battle"]["second"]["status"] == "paralysis"
    assert pikachu["status"] == "burn"
    assert pikachu["hp"] == pikachu["max_hp"] - pikachu["max_hp"] // 16


@pytest.fixture
def ai_context(tmp_path):
    """Salamèche joue l'IA ; Pikachu a déjà révélé Cage Éclair."""
    repository = SqliteBattleRepository(tmp_path / "battles.sqlite3")
    repository.initialize()
    record = BattleService(repository, CATALOG).create_battle("pikachu", "salameche")
    record.battle.first.pp[2] -= 1
    return ToolsContext.from_record(record, record.battle.second.id, 0)


def testLIaLocaleBruleDAbordUnPikachuEnForme(ai_context):
    """Pikachu n'est pas de type Feu et n'a aucun statut : Feu Follet (emplacement 2) s'appliquerait."""
    decision = asyncio.run(LocalOpponent().choose(ai_context))
    assert decision.attack_slot == 2


def testLesEstimationsDeDegatsIgnorentLesAttaquesDeStatut(ai_context):
    """Une attaque sans puissance n'a pas de dégâts à estimer, ni pour l'IA ni pour la menace adverse."""
    damage = execute_tool(ai_context, ToolCall("estimate01", "estimate_damage", "{}"))
    assert [estimate["name"] for estimate in damage["estimates"]] == ["Charge", "Flammèche"]
    incoming = execute_tool(ai_context, ToolCall("incoming01", "estimate_incoming_damage", "{}"))
    assert incoming["revealed_attacks"] == []
    assert incoming["max_ko_probability_now"] is None
