"""Risque réel : seules les attaques adverses révélées comptent, calculées avec la formule du moteur."""

from dataclasses import asdict

import pytest

from pokemon_battle.application.ai.generation import ToolCall
from pokemon_battle.application.ai.scenarios import SCENARIOS
from pokemon_battle.application.ai.tools import execute_tool
from pokemon_battle.application.ai.tools_context import ToolsContext
from pokemon_battle.engine import BattleEngine, DamageDealt


def incoming(name, mutate=None):
    record = SCENARIOS[name].create()
    if mutate is not None:
        mutate(record)
    ctx = ToolsContext.from_record(record, "agent", 0)
    return record, ctx, execute_tool(ctx, ToolCall("incoming01", "estimate_incoming_damage", "{}"))


def testUneAttaqueNonUtiliseeResteInconnue():
    """Au début du combat, aucune attaque adverse n'est révélée : le risque n'est pas inventé."""
    _, ctx, result = incoming("pikachu_vs_ground")
    assert ctx.view.opponent_revealed_moves == ()
    assert result["revealed_attacks"] == []
    assert result["max_ko_probability_now"] is None
    assert "déjà utilisées" in result["assumption"]


def testGriffeReveleeTueMaintenantMaisPasApresUnePotion():
    """heal_to_survive : 22-26 PV sur 20 PV, puis 40 PV après la potion."""
    _, _, result = incoming("heal_to_survive")
    [griffe] = result["revealed_attacks"]
    # Dégâts bruts, non tronqués aux 20 PV actuels.
    assert (griffe["name"], griffe["min_damage_on_hit"], griffe["max_damage_on_hit"]) == ("Griffe", 22, 26)
    assert griffe["ko_probability_now"] == 1.0
    assert griffe["ko_probability_after_potion"] == 0.0
    assert (result["max_ko_probability_now"], result["max_ko_probability_after_potion"]) == (1.0, 0.0)
    assert result["turn_order"] == "agent_attacks_first"


def testSansPotionLeRisqueApresSoinEstAbsent():
    """Avec un stock vide, aucun scénario « après potion » n'est proposé au modèle."""
    def empty(record):
        record.battle.second.potions = 0
    _, _, result = incoming("heal_to_survive", empty)
    assert result["revealed_attacks"][0]["ko_probability_after_potion"] is None
    assert result["max_ko_probability_after_potion"] is None


def testLEstimationNeModifiePasLeCombat():
    record, ctx, _ = incoming("no_heal_needed")
    before = asdict(record)
    execute_tool(ctx, ToolCall("incoming02", "estimate_incoming_damage", "{}"))
    assert asdict(record) == before


@pytest.mark.parametrize("roll", range(85, 101))
def testLesDegatsAnnoncesCorrespondentAuMoteur(roll):
    """Chaque tirage de Griffe sur Pikachu à PV pleins reste dans les bornes annoncées."""
    def full(record):
        record.battle.second.hp = record.battle.second.species.stats.hp
    _, _, result = incoming("no_heal_needed", full)
    [griffe] = result["revealed_attacks"]
    class FixedRandom:
        def randint(self, lower, upper):
            return roll if (lower, upper) == (85, 100) else lower
    fresh = SCENARIOS["no_heal_needed"].create()
    fresh.battle.second.hp = fresh.battle.second.species.stats.hp
    events = BattleEngine(FixedRandom()).play_turn(fresh.battle, 0, 0)
    damage = next(event.damage for event in events if isinstance(event, DamageDealt) and event.actor == "player")
    assert griffe["min_damage_on_hit"] <= damage <= griffe["max_damage_on_hit"]
    assert (griffe["min_damage_on_hit"], griffe["max_damage_on_hit"]) == (22, 26)


@pytest.mark.parametrize("name, action, slot", [
    ("finish_over_heal", "attack", 0),
    ("heal_to_survive", "potion", None),
    ("no_heal_needed", "attack", 0),
])
def testLaStrategieDeReferenceResoutLesScenariosDeChoix(name, action, slot):
    """La simulation sans réseau confirme que chaque scénario a une réponse calculable."""
    import asyncio
    from pokemon_battle import ai_smoke
    report = asyncio.run(ai_smoke.run_scenario(ai_smoke.SimulatedClient(), mode="simulation", model="sim",
                                               timeout=1, scenario_name=name))
    assert (report["decision"]["action_type"], report["decision"]["attack_slot"]) == (action, slot)
    assert report["passed"] is True


@pytest.mark.parametrize("name, lethal, finishing, prevents", [
    ("finish_over_heal", True, ["Éclair"], True),
    ("heal_to_survive", True, [], True),
    ("no_heal_needed", False, [], False),
])
def testLeVerdictRelieRisqueAttaqueEtPotionSansRecommander(name, lethal, finishing, prevents):
    """Le verdict factuel distingue les trois scénarios de choix, sans imposer d'action."""
    _, _, result = incoming(name)
    assert (result["lethal_now"], result["attack_ko_before_riposte"], result["potion_prevents_ko"]) == (lethal, finishing, prevents)
    assert "select_" not in result["summary"]


def testLeResumeDeHealToSurviveDecritLaSituation():
    _, _, result = incoming("heal_to_survive")
    assert (result["hp_now"], result["hp_after_potion"]) == (20, 40)
    assert result["summary"] == ("Avec 20 PV, une attaque adverse révélée te met KO ce tour avec une probabilité de 1.0. "
                                 "Aucune de tes attaques ne peut mettre l'adversaire KO avant sa riposte. "
                                 "Après une potion, tu aurais 40 PV et ce risque serait de 0.0.")


def testUnAdversairePlusRapideAnnuleLeKoAvantRiposte():
    """Si l'adversaire agit d'abord, même un KO certain n'empêche pas sa riposte."""
    from dataclasses import replace
    record = SCENARIOS["finish_over_heal"].create()
    ctx = ToolsContext.from_record(record, "agent", 0)
    fast = replace(ctx.view.opponent.stats, speed=200)
    ctx.view = replace(ctx.view, opponent=replace(ctx.view.opponent, stats=fast))
    result = execute_tool(ctx, ToolCall("incoming03", "estimate_incoming_damage", "{}"))
    assert result["turn_order"] == "opponent_attacks_first"
    assert result["attack_ko_before_riposte"] == []


def testSansAttaqueReveleeLeVerdictResteInconnu():
    _, _, result = incoming("pikachu_vs_ground")
    assert result["lethal_now"] is False and result["potion_prevents_ko"] is False
    assert result["summary"] == "Aucune attaque adverse révélée : le risque de KO n'est pas connu."


def testUnKoProbableNEstPasPresenteCommeImpossible():
    """Un KO à 90 % avant la riposte n'est ni garanti ni nié : le résumé donne la probabilité."""
    from dataclasses import replace
    record = SCENARIOS["finish_over_heal"].create()
    ctx = ToolsContext.from_record(record, "agent", 0)
    ctx.view = replace(ctx.view, moves=tuple(replace(move, accuracy=90) if move.attack_slot == 0 else move
                                             for move in ctx.view.moves))
    result = execute_tool(ctx, ToolCall("incoming04", "estimate_incoming_damage", "{}"))
    assert result["attack_ko_before_riposte"] == []
    assert result["best_ko_before_riposte"] == {"name": "Éclair", "probability": 0.9}
    assert "Aucun KO garanti avant la riposte ; meilleure chance : Éclair (0.9)." in result["summary"]


def testUnAdversairePlusRapideEstSignaleDansLeResume():
    from dataclasses import replace
    record = SCENARIOS["finish_over_heal"].create()
    ctx = ToolsContext.from_record(record, "agent", 0)
    ctx.view = replace(ctx.view, opponent=replace(ctx.view.opponent, stats=replace(ctx.view.opponent.stats, speed=200)))
    result = execute_tool(ctx, ToolCall("incoming05", "estimate_incoming_damage", "{}"))
    assert result["best_ko_before_riposte"] is None
    assert "Tu n'agis pas avant l'adversaire" in result["summary"]
