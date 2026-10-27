"""Petit catalogue de démonstration avec des statistiques effectives simplifiées."""

from dataclasses import replace
from types import MappingProxyType

from pokemon_battle.domain import (
    ApplyStatus, Attack, BattleStat, Category, ModifyStat, Protect, Species, Stats, StatusCondition, Target,
)
from pokemon_battle.types import Type
from .pokemon_catalogue import species_definitions

TACKLE = Attack("Charge", Type.NORMAL, 40, 100, 35)
# Attaques de statut relevées sur PokéAPI (/api/v2/move) le 27/10/2026 : nom français, précision,
# PP, priorité et cible. Pikachu et Salamèche les apprennent tous deux d'après /api/v2/pokemon.
THUNDER_WAVE = Attack("Cage Éclair", Type.ELECTRIC, None, 90, 20, Category.STATUS,
                      effects=(ApplyStatus(StatusCondition.PARALYSIS),))
PROTECT = Attack("Abri", Type.NORMAL, None, None, 10, Category.STATUS,
                 target=Target.SELF, priority=4, effects=(Protect(),))
WILL_O_WISP = Attack("Feu Follet", Type.FIRE, None, 85, 15, Category.STATUS,
                     effects=(ApplyStatus(StatusCondition.BURN),))
SWORDS_DANCE = Attack("Danse Lames", Type.NORMAL, None, None, 20, Category.STATUS,
                      target=Target.SELF, effects=(ModifyStat(BattleStat.ATTACK, 2),))
IMPORTED_CATALOG = species_definitions()
DEMO_CATALOG = {
    "pikachu": replace(IMPORTED_CATALOG["pikachu"], attacks=(
        Attack("Éclair", Type.ELECTRIC, 40, 100, 30, Category.SPECIAL),
        *IMPORTED_CATALOG["pikachu"].attacks[:1],
        THUNDER_WAVE, PROTECT,
    )),
    "bulbizarre": Species("Bulbizarre", (Type.GRASS, Type.POISON),
                          Stats(120, 69, 70, 85, 86, 65),
                          (TACKLE, Attack("Fouet Lianes", Type.GRASS, 45, 100, 25))),
    "salameche": Species("Salamèche", (Type.FIRE,), Stats(114, 72, 63, 80, 70, 85),
                         (TACKLE, Attack("Flammèche", Type.FIRE, 40, 100, 25, Category.SPECIAL),
                          WILL_O_WISP, SWORDS_DANCE)),
    "carapuce": Species("Carapuce", (Type.WATER,), Stats(119, 68, 85, 71, 84, 63),
                        (TACKLE, Attack("Pistolet à O", Type.WATER, 40, 100, 25, Category.SPECIAL))),
}

# Les exemples historiques gardent leurs statistiques, quel que soit l'alias choisi.
CATALOG = MappingProxyType({**IMPORTED_CATALOG, **DEMO_CATALOG,
                            "bulbasaur": DEMO_CATALOG["bulbizarre"],
                            "charmander": DEMO_CATALOG["salameche"],
                            "salamèche": DEMO_CATALOG["salameche"],
                            "squirtle": DEMO_CATALOG["carapuce"]})
