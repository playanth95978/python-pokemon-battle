"""Table des types : les relations absentes sont neutres."""

from enum import StrEnum
from fractions import Fraction


class Type(StrEnum):
    NORMAL = "normal"
    FIRE = "fire"
    WATER = "water"
    ELECTRIC = "electric"
    GRASS = "grass"
    ICE = "ice"
    FIGHTING = "fighting"
    POISON = "poison"
    GROUND = "ground"
    FLYING = "flying"
    PSYCHIC = "psychic"
    BUG = "bug"
    ROCK = "rock"
    GHOST = "ghost"
    DRAGON = "dragon"
    DARK = "dark"
    STEEL = "steel"
    FAIRY = "fairy"


# Attaque -> (faiblesses, résistances, immunités) du défenseur.
_RELATIONS = {
    Type.NORMAL: ("", "rock steel", "ghost"),
    Type.FIRE: ("grass ice bug steel", "fire water rock dragon", ""),
    Type.WATER: ("fire ground rock", "water grass dragon", ""),
    Type.ELECTRIC: ("water flying", "electric grass dragon", "ground"),
    Type.GRASS: ("water ground rock", "fire grass poison flying bug dragon steel", ""),
    Type.ICE: ("grass ground flying dragon", "fire water ice steel", ""),
    Type.FIGHTING: ("normal ice rock dark steel", "poison flying psychic bug fairy", "ghost"),
    Type.POISON: ("grass fairy", "poison ground rock ghost", "steel"),
    Type.GROUND: ("fire electric poison rock steel", "grass bug", "flying"),
    Type.FLYING: ("grass fighting bug", "electric rock steel", ""),
    Type.PSYCHIC: ("fighting poison", "psychic steel", "dark"),
    Type.BUG: ("grass psychic dark", "fire fighting poison flying ghost steel fairy", ""),
    Type.ROCK: ("fire ice flying bug", "fighting ground steel", ""),
    Type.GHOST: ("psychic ghost", "dark", "normal"),
    Type.DRAGON: ("dragon", "steel", "fairy"),
    Type.DARK: ("psychic ghost", "fighting dark fairy", ""),
    Type.STEEL: ("ice rock fairy", "fire water electric steel", ""),
    Type.FAIRY: ("fighting dragon dark", "fire poison steel", ""),
}


def effectiveness(attack_type: Type, defender_types: tuple[Type, ...]) -> Fraction:
    result = Fraction(1)
    strong, weak, immune = (values.split() for values in _RELATIONS[attack_type])
    for defender in defender_types:
        if defender in immune:
            return Fraction(0)
        if defender in strong:
            result *= 2
        elif defender in weak:
            result /= 2
    return result
