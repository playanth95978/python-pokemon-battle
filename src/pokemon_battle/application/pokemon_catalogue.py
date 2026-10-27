"""Instantané PokéAPI fourni avec le livrable : aucun appel réseau au démarrage."""

import json
from functools import lru_cache
from importlib.resources import files

from pokemon_battle.domain import Attack, Category, Species, Stats
from .effect_serialization import deserialize_effect
from pokemon_battle.types import Type


@lru_cache(maxsize=1)
def catalogue_data() -> dict:
    return json.loads(files("pokemon_battle").joinpath("data/catalogue.json").read_text(encoding="utf-8"))


def species_definitions() -> dict[str, Species]:
    definitions = {}
    for item in catalogue_data()["species"]:
        attacks = tuple(Attack(**{**attack, "type": Type(attack["type"]), "category": Category(attack["category"]),
                                  "effects": tuple(deserialize_effect(effect) for effect in attack.get("effects", []))})
                        for attack in item["attacks"])
        species = Species(item["name"], tuple(Type(kind) for kind in item["types"]), Stats(**item["stats"]), attacks)
        definitions[item["key"]] = species
        definitions[item["name"].casefold()] = species
    return definitions


def catalogue_metadata() -> dict:
    data = catalogue_data()
    # Ne pas envoyer des statistiques que React pourrait utiliser pour simuler le combat.
    return {**{key: value for key, value in data.items() if key != "species"},
            "species": [{key: value for key, value in item.items() if key not in ("stats", "attacks")}
                        for item in data["species"]]}
