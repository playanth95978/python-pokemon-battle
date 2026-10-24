"""Vue isolée du combat et mémoire temporaire d'une seule décision."""

from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID

from pokemon_battle.domain import Category, Fighter
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

    @classmethod
    def from_fighter(cls, fighter: Fighter) -> "FighterView":
        return cls(fighter.id, fighter.species.name, fighter.level, fighter.hp,
                   fighter.species.stats.hp, fighter.species.types)


@dataclass(frozen=True, slots=True)
class MoveView:
    slot: int
    name: str
    type: Type
    category: Category
    power: int
    accuracy: int
    pp: int
    max_pp: int


@dataclass(frozen=True, slots=True)
class BattleView:
    turn: int
    fighter: FighterView
    opponent: FighterView
    moves: tuple[MoveView, ...]


@dataclass(frozen=True, slots=True)
class AttackDecision:
    slot: int
    source: Literal["llm", "local"]
    comment: str = ""
    fallback_reason: str | None = None


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

    @classmethod
    def from_record(cls, record: StoredBattle, fighter_id: str, expected_turn: int) -> "ToolsContext":
        battle = record.battle
        if type(expected_turn) is not int or expected_turn != battle.turn:
            raise TurnConflictError("Le combat a évolué avant la décision de l'IA")
        if battle.winner is not None:
            raise BattleFinishedError("Le combat est déjà terminé")
        fighters = {battle.first.id: (battle.first, battle.second), battle.second.id: (battle.second, battle.first)}
        if fighter_id not in fighters:
            raise InvalidMoveError("Le combattant IA n'appartient pas au combat")
        actor, opponent = fighters[fighter_id]
        # Les valeurs sont copiées ; aucun Fighter mutable ni choix du joueur n'entre dans le contexte.
        moves = tuple(MoveView(index, attack.name, attack.type, attack.category, attack.power,
                               attack.accuracy, actor.pp[index], attack.max_pp)
                      for index, attack in enumerate(actor.species.attacks))
        context = cls(record.id, BattleView(battle.turn, FighterView.from_fighter(actor),
                                           FighterView.from_fighter(opponent), moves))
        if not context.legal_moves:
            raise InvalidMoveError("Le combattant IA n'a plus d'attaque disponible")
        return context
