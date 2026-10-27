"""Vue isolée du combat et mémoire temporaire d'une seule décision."""

from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID

from pokemon_battle.domain import AttackAction, BattleAction, Category, Fighter, Stats, UsePotionAction, potion_unavailable_reason
from pokemon_battle.types import Type
from pokemon_battle.application.battle_repository import StoredBattle
from pokemon_battle.application.battle_service import BattleFinishedError, InvalidMoveError, TurnConflictError
from .telemetry import DecisionMetrics


@dataclass(frozen=True, slots=True)
class FighterView:
    id: str
    species: str
    level: int
    hp: int
    max_hp: int
    types: tuple[Type, ...]
    stats: Stats
    potions: int

    @classmethod
    def from_fighter(cls, fighter: Fighter) -> "FighterView":
        return cls(fighter.id, fighter.species.name, fighter.level, fighter.hp,
                   fighter.species.stats.hp, fighter.species.types, fighter.species.stats,fighter.potions)


@dataclass(frozen=True, slots=True)
class MoveView:
    attack_slot: int
    name: str
    type: Type
    category: Category
    power: int | None
    accuracy: int | None
    pp: int
    max_pp: int

    @property
    def deals_damage(self) -> bool:
        return self.category != Category.STATUS

    @property
    def hit_chance(self) -> int:
        """Précision en pourcentage ; une précision non applicable touche toujours."""
        return 100 if self.accuracy is None else self.accuracy


@dataclass(frozen=True, slots=True)
class BattleView:
    turn: int
    fighter: FighterView
    opponent: FighterView
    moves: tuple[MoveView, ...]
    # Attaques adverses déjà utilisées (PP entamés) : publiques, contrairement au reste du catalogue.
    opponent_revealed_moves: tuple[MoveView, ...] = ()


@dataclass(frozen=True, slots=True)
class AttackDecision:
    # attack_slot vaut None pour une potion ; action_type figure en dernier pour
    # rester compatible avec les reçus déjà enregistrés et les constructions positionnelles.
    attack_slot: int | None
    source: Literal["llm", "local"]
    comment: str = ""
    fallback_reason: str | None = None
    action_type: Literal["attack", "potion"] = "attack"

    def action(self) -> BattleAction:
        if self.action_type == "potion":
            return UsePotionAction()
        assert self.attack_slot is not None
        return AttackAction(self.attack_slot)


@dataclass(slots=True)
class ToolsContext:
    battle_id: UUID
    view: BattleView
    observations: dict[str, Any] = field(default_factory=dict)
    decision: AttackDecision | None = None
    metrics: DecisionMetrics = field(default_factory=DecisionMetrics)

    @property
    def legal_moves(self) -> tuple[MoveView, ...]:
        return tuple(move for move in self.view.moves if move.pp > 0)

    @property
    def can_use_potion(self) -> bool:
        fighter = self.view.fighter
        return potion_unavailable_reason(fighter.hp, fighter.max_hp, fighter.potions) is None

    @property
    def has_playable_action(self) -> bool:
        # Sans PP, une potion reste une action jouable pour le moteur.
        return bool(self.legal_moves) or self.can_use_potion

    @classmethod
    def from_record(cls, record: StoredBattle, fighter_id: str, expected_turn: int) -> "ToolsContext":
        battle = record.battle
        if type(expected_turn) is not int or expected_turn != battle.turn:
            raise TurnConflictError("Le combat a évolué avant la décision de l'IA")
        if battle.is_over:
            raise BattleFinishedError("Le combat est déjà terminé")
        fighters = {battle.first.id: (battle.first, battle.second), battle.second.id: (battle.second, battle.first)}
        if fighter_id not in fighters:
            raise InvalidMoveError("Le combattant IA n'appartient pas au combat")
        actor, opponent = fighters[fighter_id]
        # Les valeurs sont copiées ; aucun Fighter mutable ni choix du joueur n'entre dans le contexte.
        moves = tuple(MoveView(index, attack.name, attack.type, attack.category, attack.power,
                               attack.accuracy, actor.pp[index], attack.max_pp)
                      for index, attack in enumerate(actor.species.attacks))
        revealed = tuple(MoveView(index, attack.name, attack.type, attack.category, attack.power,
                                  attack.accuracy, opponent.pp[index], attack.max_pp)
                         for index, attack in enumerate(opponent.species.attacks) if opponent.pp[index] < attack.max_pp)
        context = cls(record.id, BattleView(battle.turn, FighterView.from_fighter(actor),
                                            FighterView.from_fighter(opponent), moves, revealed))
        if not context.has_playable_action:
            raise InvalidMoveError("Le combattant IA n'a plus d'action disponible")
        return context
