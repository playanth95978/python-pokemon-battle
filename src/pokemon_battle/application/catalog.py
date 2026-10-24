"""Petit catalogue de démonstration avec des statistiques effectives simplifiées."""

from types import MappingProxyType

from pokemon_battle.domain import Attack, Category, Species, Stats
from pokemon_battle.types import Type
from .pokemon_catalogue import species_definitions

TACKLE = Attack("Charge", Type.NORMAL, 40, 100, 35)
CATALOG = MappingProxyType({
    **species_definitions(),
    "bulbizarre": Species("Bulbizarre", (Type.GRASS, Type.POISON),
                          Stats(120, 69, 70, 85, 86, 65),
                          (TACKLE, Attack("Fouet Lianes", Type.GRASS, 45, 100, 25))),
    "salameche": Species("Salamèche", (Type.FIRE,), Stats(114, 72, 63, 80, 70, 85),
                        (TACKLE, Attack("Flammèche", Type.FIRE, 40, 100, 25, Category.SPECIAL))),
    "carapuce": Species("Carapuce", (Type.WATER,), Stats(119, 68, 85, 71, 84, 63),
                       (TACKLE, Attack("Pistolet à O", Type.WATER, 40, 100, 25, Category.SPECIAL))),
})
