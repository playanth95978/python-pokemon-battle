"""Définitions immuables et état propre à chaque combattant."""

from dataclasses import dataclass, field
from enum import StrEnum
from fractions import Fraction

from .types import Type


POTION_HEAL_HP = 20


def potion_healing(hp: int, max_hp: int) -> int:
    """PV réellement rendus par une potion, sans dépasser le maximum."""
    return min(POTION_HEAL_HP, max_hp - hp)


def potion_unavailable_reason(hp: int, max_hp: int, potions: int) -> str | None:
    """Raison d'un refus de potion, ou None si elle est utilisable ; même ordre que le moteur."""
    if hp <= 0:
        return "Le combattant est KO"
    if hp >= max_hp:
        return "Les PV sont déjà pleins"
    if potions <= 0:
        return "Le stock de potions est vide"
    return None


class Category(StrEnum):
    PHYSICAL = "physical"
    SPECIAL = "special"
    STATUS = "status"


class Target(StrEnum):
    OPPONENT = "opponent"
    SELF = "self"


class StatusCondition(StrEnum):
    PARALYSIS = "paralysis"
    BURN = "burn"


class BattleStat(StrEnum):
    """Statistiques modifiables en combat ; les PV n'en font pas partie."""
    ATTACK = "attack"
    DEFENSE = "defense"
    SPECIAL_ATTACK = "special_attack"
    SPECIAL_DEFENSE = "special_defense"
    SPEED = "speed"


MAX_STAT_STAGE = 6
MIN_PRIORITY, MAX_PRIORITY = -7, 5


def positive(value: int, name: str) -> None:
    if type(value) is not int or value <= 0:
        raise ValueError(f"{name} must be a positive integer")


def stat_stage(value: int, name: str) -> None:
    if type(value) is not int or not -MAX_STAT_STAGE <= value <= MAX_STAT_STAGE:
        raise ValueError(f"{name} must be between -{MAX_STAT_STAGE} and {MAX_STAT_STAGE}")


def staged_value(value: int, stage: int) -> int:
    """Statistique modifiée par un cran : (2 + n) / 2 en hausse, 2 / (2 - n) en baisse."""
    stat_stage(stage, "stage")
    multiplier = Fraction(2 + stage, 2) if stage >= 0 else Fraction(2, 2 - stage)
    # Au moins 1 : une défense nulle rendrait la formule de dégâts indéfinie.
    return max(1, int(value * multiplier))


@dataclass(frozen=True, slots=True)
class ApplyStatus:
    condition: StatusCondition

    def __post_init__(self) -> None:
        if not isinstance(self.condition, StatusCondition):
            raise ValueError("Invalid status condition")


@dataclass(frozen=True, slots=True)
class ModifyStat:
    stat: BattleStat
    stages: int

    def __post_init__(self) -> None:
        if not isinstance(self.stat, BattleStat):
            raise ValueError("Invalid battle statistic")
        stat_stage(self.stages, "stages")
        if self.stages == 0:
            raise ValueError("stages must change the statistic")


@dataclass(frozen=True, slots=True)
class Protect:
    pass


type AttackEffect = ApplyStatus | ModifyStat | Protect
ATTACK_EFFECTS = (ApplyStatus, ModifyStat, Protect)


@dataclass(frozen=True, slots=True)
class StatStages:
    """Crans de modification propres à un combattant ; les statistiques de l'espèce ne bougent pas."""
    attack: int = 0
    defense: int = 0
    special_attack: int = 0
    special_defense: int = 0
    speed: int = 0

    def __post_init__(self) -> None:
        for name in self.__dataclass_fields__:
            stat_stage(getattr(self, name), name)

    def of(self, stat: BattleStat) -> int:
        return getattr(self, stat.value)


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
    """Définition d'attaque.

    `power` vaut None seulement pour une attaque de statut (0 y est normalisé).
    `accuracy` vaut None quand aucun test de précision ne s'applique.
    """
    name: str
    type: Type
    power: int | None
    accuracy: int | None
    max_pp: int
    category: Category = Category.PHYSICAL
    target: Target = Target.OPPONENT
    priority: int = 0
    effects: tuple[AttackEffect, ...] = ()

    def __post_init__(self) -> None:
        # Un instantané JSON relit la cible en texte : la normaliser comme les tuples de Species.
        object.__setattr__(self, "target", Target(self.target))
        object.__setattr__(self, "effects", tuple(self.effects))
        if self.category == Category.STATUS and type(self.power) is int and self.power == 0:
            object.__setattr__(self, "power", None)
        if not self.name.strip() or not isinstance(self.type, Type):
            raise ValueError("Attack needs a name and a valid type")
        if not isinstance(self.category, Category):
            raise ValueError("Invalid attack category")
        positive(self.max_pp, "max_pp")
        if type(self.priority) is not int or not MIN_PRIORITY <= self.priority <= MAX_PRIORITY:
            raise ValueError(f"priority must be between {MIN_PRIORITY} and {MAX_PRIORITY}")
        self._validate_power()
        self._validate_accuracy()
        self._validate_effects()

    @property
    def deals_damage(self) -> bool:
        return self.category != Category.STATUS

    def _validate_power(self) -> None:
        if self.deals_damage:
            positive(self.power, "power")
        elif self.power is not None:
            raise ValueError("A status attack deals no damage and has no power")

    def _validate_accuracy(self) -> None:
        if self.accuracy is None:
            return
        if type(self.accuracy) is not int or not 1 <= self.accuracy <= 100:
            raise ValueError("accuracy must be between 1 and 100")
        if self.target == Target.SELF:
            raise ValueError("An attack targeting its user has no accuracy check")

    def _validate_effects(self) -> None:
        if any(not isinstance(effect, ATTACK_EFFECTS) for effect in self.effects):
            raise ValueError("Invalid attack effect")
        if self.deals_damage:
            # Les effets secondaires probabilistes ne sont pas encore définis : les refuser
            # évite qu'une attaque à dégâts paralyse à coup sûr.
            if self.effects:
                raise ValueError("Effects on damaging attacks are not supported yet")
            if self.target != Target.OPPONENT:
                raise ValueError("A damaging attack targets the opponent")
            return
        if not self.effects:
            raise ValueError("A status attack needs at least one effect")
        if self.target != Target.SELF and any(isinstance(effect, Protect) for effect in self.effects):
            raise ValueError("Protection applies to the user")


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
    status: StatusCondition | None = field(default=None, init=False)
    stat_stages: StatStages = field(default_factory=StatStages, init=False)
    # Protection valable pour le tour en cours ; le moteur la lève en fin de tour.
    protected: bool = field(default=False, init=False)
    # Une protection réussie au tour précédent fait échouer la suivante.
    protected_last_turn: bool = field(default=False, init=False)

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

    @property
    def effective_speed(self) -> int:
        speed = staged_value(self.species.stats.speed, self.stat_stages.speed)
        return speed // 2 if self.status == StatusCondition.PARALYSIS else speed


@dataclass(frozen=True, slots=True)
class AttackAction:
    attack_slot: int


@dataclass(frozen=True, slots=True)
class UsePotionAction:
    pass


type BattleAction = AttackAction | UsePotionAction