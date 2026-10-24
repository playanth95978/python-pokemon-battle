"""Petit catalogue de démonstration avec des statistiques effectives simplifiées."""

from dataclasses import replace
from types import MappingProxyType

from pokemon_battle.domain import Attack, Category, Species, Stats
from pokemon_battle.types import Type
from .pokemon_catalogue import species_definitions

TACKLE = Attack("Charge", Type.NORMAL, 40, 100, 35)
IMPORTED_CATALOG = species_definitions()
DEMO_CATALOG = {
    "pikachu": replace(IMPORTED_CATALOG["pikachu"], attacks=(
        Attack("Éclair", Type.ELECTRIC, 40, 100, 30, Category.SPECIAL),
        *IMPORTED_CATALOG["pikachu"].attacks[:3],
    )),
    "bulbizarre": Species("Bulbizarre", (Type.GRASS, Type.POISON),
                          Stats(120, 69, 70, 85, 86, 65),
                          (TACKLE, Attack("Fouet Lianes", Type.GRASS, 45, 100, 25))),
    "salameche": Species("Salamèche", (Type.FIRE,), Stats(114, 72, 63, 80, 70, 85),
                         (TACKLE, Attack("Flammèche", Type.FIRE, 40, 100, 25, Category.SPECIAL))),
    "carapuce": Species("Carapuce", (Type.WATER,), Stats(119, 68, 85, 71, 84, 63),
                        (TACKLE, Attack("Pistolet à O", Type.WATER, 40, 100, 25, Category.SPECIAL))),
}

# Les exemples historiques gardent leurs statistiques, quel que soit l'alias choisi.
CATALOG = MappingProxyType({**IMPORTED_CATALOG, **DEMO_CATALOG,
                            "bulbasaur": DEMO_CATALOG["bulbizarre"],
                            "charmander": DEMO_CATALOG["salameche"],
                            "salamèche": DEMO_CATALOG["salameche"],
                            "squirtle": DEMO_CATALOG["carapuce"]})
