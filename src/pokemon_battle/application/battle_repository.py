"""Contrat de stockage indépendant de SQLite et de HTTP."""

from dataclasses import dataclass
from contextlib import AbstractContextManager
from typing import Protocol
from uuid import UUID

from pokemon_battle.engine import Battle


@dataclass(frozen=True, slots=True)
class StoredBattle:
    id: UUID
    battle: Battle


class BattleSession(Protocol):
    def save(self, record: StoredBattle) -> None: ...

    def get(self, battle_id: UUID) -> StoredBattle | None: ...


class BattleRepository(BattleSession, Protocol):
    def transaction(self) -> AbstractContextManager[BattleSession]: ...
