"""Estimation du soin sur un instantané, sans utilisation réelle de potion."""

from dataclasses import asdict, replace

import pytest

from pokemon_battle.application.ai.healing_estimation import estimate_healing
from pokemon_battle.application.ai.scenarios import SCENARIOS
from pokemon_battle.application.ai.tools_context import ToolsContext


@pytest.fixture
def snapshot():
    record = SCENARIOS["pikachu_vs_ground"].create()
    context = ToolsContext.from_record(record, "agent", expected_turn=0)
    return record, context


@pytest.mark.parametrize("hp, potions, expected", [
    pytest.param(50, 2, {
        "available": True, "healed": 20, "hp_after_healing": 70,
        "potions_remaining_after_use": 1,
    }, id="soin-de-vingt-pv"),
    pytest.param(100, 2, {
        "available": True, "healed": 10, "hp_after_healing": 110,
        "potions_remaining_after_use": 1,
    }, id="soin-limite-aux-pv-manquants"),
    pytest.param(110, 2, {"available": False, "reason": "Les PV sont déjà pleins"}, id="pv-pleins"),
    pytest.param(50, 0, {"available": False, "reason": "Le stock de potions est vide"}, id="stock-vide"),
    pytest.param(0, 2, {"available": False, "reason": "Le combattant est KO"}, id="combattant-ko"),
])
def testLEstimationDuSoinRespecteLesReglesSansModifierLEtat(snapshot, hp, potions, expected):
    """Chaque estimation doit expliquer la disponibilité et laisser le contexte et le combat intacts."""
    record, context = snapshot
    # Un contexte de combat terminé est refusé à la création ; construire la vue KO
    # explicitement permet de vérifier aussi la protection défensive de l'estimateur.
    context.view = replace(context.view, fighter=replace(context.view.fighter, hp=hp, potions=potions))
    before_context = asdict(context)
    before_record = asdict(record)

    result = estimate_healing(context)

    assert result == expected
    assert asdict(context) == before_context
    assert asdict(record) == before_record
    assert estimate_healing(context) == expected


def testLEstimationUtiliseLInstantaneMemeSiLeCombatEvolue(snapshot):
    """Une modification du combat après la copie ne doit pas changer une estimation déjà préparée."""
    record, context = snapshot
    context.view = replace(context.view, fighter=replace(context.view.fighter, hp=50, potions=1))
    record.battle.second.hp = 1
    record.battle.second.potions = 0

    assert estimate_healing(context) == {
        "available": True, "healed": 20, "hp_after_healing": 70,
        "potions_remaining_after_use": 0,
    }
    assert record.battle.second.hp == 1
    assert record.battle.second.potions == 0
