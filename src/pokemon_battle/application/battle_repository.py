"""Contrat de stockage indépendant de SQLite et de HTTP."""

from dataclasses import dataclass
from contextlib import AbstractContextManager
from typing import Protocol
from uuid import UUID

from pokemon_battle.engine import Battle, DomainEvent


@dataclass(frozen=True, slots=True)
class StoredBattle:
    id: UUID
    battle: Battle


@dataclass(frozen=True, slots=True)
class TurnResult:
    record: StoredBattle
    events: tuple[DomainEvent, ...]


@dataclass(frozen=True, slots=True)
class StoredTurn:
    expected_turn: int
    first_move: int
    second_move: int
    result: TurnResult


class BattleSession(Protocol):
    def save(self, record: StoredBattle) -> None: ...

    def get(self, battle_id: UUID) -> StoredBattle | None: ...

    def get_turn(self, battle_id: UUID, key: UUID) -> StoredTurn | None: ...

    def save_turn(self, battle_id: UUID, key: UUID, receipt: StoredTurn) -> None: ...


class BattleRepository(Protocol):
    def save(self, record: StoredBattle) -> None: ...

    def get(self, battle_id: UUID) -> StoredBattle | None: ...

    def transaction(self) -> AbstractContextManager[BattleSession]: ...
