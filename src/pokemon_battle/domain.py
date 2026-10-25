"""Définitions immuables et état propre à chaque combattant."""

from dataclasses import dataclass, field
from enum import StrEnum

from .types import Type


POTION_HEAL_HP = 20


def potion_healing(hp: int, max_hp: int) -> int:
    """PV réellement rendus par une potion, sans dépasser le maximum."""
    return min(POTION_HEAL_HP, max_hp - hp)


class Category(StrEnum):
    PHYSICAL = "physical"
    SPECIAL = "special"


def positive(value: int, name: str) -> None:
    if type(value) is not int or value <= 0:
        raise ValueError(f"{name} must be a positive integer")


@dataclass(frozen=True, slots=True)
class Stats:
    hp: int
    attack: int
    defense: int
    special_attack: int
    special_defense: int
    speed: int

    def __post_init__(self) -> None:
        for name in self.__dataclass_fields__:
            positive(getattr(self, name), name)


@dataclass(frozen=True, slots=True)
class Attack:
    name: str
    type: Type
    power: int
    accuracy: int
    max_pp: int
    category: Category = Category.PHYSICAL

    def __post_init__(self) -> None:
        if not self.name.strip() or not isinstance(self.type, Type):
            raise ValueError("Attack needs a name and a valid type")
        positive(self.power, "power")
        positive(self.max_pp, "max_pp")
        if type(self.accuracy) is not int or not 1 <= self.accuracy <= 100:
            raise ValueError("accuracy must be between 1 and 100")
        if not isinstance(self.category, Category):
            raise ValueError("Invalid attack category")


@dataclass(frozen=True, slots=True)
class Species:
    name: str
    types: tuple[Type, ...]
    stats: Stats
    attacks: tuple[Attack, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "types", tuple(self.types))
        object.__setattr__(self, "attacks", tuple(self.attacks))
        if not self.name.strip() or not isinstance(self.stats, Stats):
            raise ValueError("Species needs a name and stats")
        if not 1 <= len(self.types) <= 2 or len(set(self.types)) != len(self.types):
            raise ValueError("Species needs one or two distinct types")
        if any(not isinstance(t, Type) for t in self.types):
            raise ValueError("Invalid species type")
        if not 1 <= len(self.attacks) <= 4 or any(not isinstance(a, Attack) for a in self.attacks):
            raise ValueError("Species needs one to four attacks")


@dataclass(slots=True)
class Fighter:
    id: str
    species: Species
    level: int = 50
    hp: int = field(init=False)
    pp: list[int] = field(init=False)
    potions: int = field(default=2, init=False)

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("Fighter id is required")
        if type(self.level) is not int or not 1 <= self.level <= 100:
            raise ValueError("level must be between 1 and 100")
        self.hp = self.species.stats.hp
        self.pp = [attack.max_pp for attack in self.species.attacks]

    @property
    def knocked_out(self) -> bool:
        return self.hp == 0


@dataclass(frozen=True, slots=True)
class AttackAction:
    attack_slot: int


@dataclass(frozen=True, slots=True)
class UsePotionAction:
    pass


type BattleAction = AttackAction | UsePotionAction