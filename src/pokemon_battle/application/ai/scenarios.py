"""Petits scénarios d'évaluation ; leurs réponses attendues ne sont jamais envoyées au modèle."""

from dataclasses import dataclass
from uuid import UUID

from pokemon_battle.application.battle_repository import StoredBattle
from pokemon_battle.domain import Attack, Category, Fighter, Species, Stats
from pokemon_battle.engine import Battle
from pokemon_battle.types import Type


@dataclass(frozen=True, slots=True)
class Scenario:
    name: str
    description: str
    actor: Species
    opponent: Species
    expected_slots: tuple[int, ...]
    reverse_moves: bool = False
    exhausted_slots: tuple[int, ...] = ()
    actor_hp: int | None = None
    potions: int = 2
    expected_action: str = "attack"

    def create(self) -> StoredBattle:
        actor = self.actor
        if self.reverse_moves:
            actor = Species(actor.name, actor.types, actor.stats, tuple(reversed(actor.attacks)))
        ai = Fighter("agent", actor)
        if self.actor_hp is not None:
            ai.hp = self.actor_hp
        ai.potions = self.potions
        for attack_slot in self.exhausted_slots:
            ai.pp[attack_slot] = 0
        return StoredBattle(UUID("00000000-0000-0000-0000-000000000025"), Battle(Fighter("player", self.opponent), ai))


_PIKACHU = Species("Pikachu", (Type.ELECTRIC,), Stats(110, 65, 54, 73, 62, 91), (
    Attack("Éclair", Type.ELECTRIC, 40, 100, 30, Category.SPECIAL),
    Attack("Charge", Type.NORMAL, 40, 100, 35),
))
_CHARMANDER = Species("Salamèche", (Type.FIRE,), Stats(114, 72, 63, 80, 70, 85), (
    Attack("Charge", Type.NORMAL, 40, 100, 35),
    Attack("Flammèche", Type.FIRE, 40, 100, 25, Category.SPECIAL),
))


def _target(name: str, types: tuple[Type, ...], special_defense: int = 55) -> Species:
    return Species(name, types, Stats(135, 74, 86, 43, special_defense, 47), (Attack("Griffe", Type.NORMAL, 40, 100, 35),))


SCENARIOS = {
    case.name: case for case in (
        Scenario("pikachu_vs_ground", "Éviter l'immunité Sol", _PIKACHU, _target("Sabelette", (Type.GROUND,)), (1,)),
        Scenario("reversed_slots", "Même immunité avec les slots inversés", _PIKACHU, _target("Sabelette", (Type.GROUND,)), (0,), reverse_moves=True),
        Scenario("water_weakness", "Exploiter la faiblesse électrique de l'Eau", _PIKACHU, _target("Carapuce", (Type.WATER,)), (0,)),
        Scenario("grass_resistance", "Préférer Charge à Éclair résisté, à puissance identique", _PIKACHU, _target("Bulbizarre", (Type.GRASS, Type.POISON), special_defense=93), (1,)),
        Scenario("exhausted_move", "L'attaque super efficace n'a plus de PP", _PIKACHU, _target("Carapuce", (Type.WATER,)), (1,), exhausted_slots=(0,)),
        Scenario("double_weakness", "Exploiter une double faiblesse au Feu", _CHARMANDER, _target("Paras", (Type.GRASS, Type.BUG)), (1,)),
        Scenario("potion_only", "Se soigner sans PP pour survivre au prochain coup", _PIKACHU,
                 _target("Sabelette", (Type.GROUND,)), (), exhausted_slots=(0, 1),
                 actor_hp=10, potions=1, expected_action="potion"),
    )
}
