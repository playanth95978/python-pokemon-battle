"""Persistance d'instantanés : les combats ne dépendent pas du catalogue futur."""

import json
import logging
import sqlite3
from contextlib import closing, contextmanager
from dataclasses import asdict
from pathlib import Path
from uuid import UUID

from pokemon_battle.application.battle_repository import StoredBattle
from pokemon_battle.domain import Attack, Category, Fighter, Species, Stats
from pokemon_battle.engine import Battle
from pokemon_battle.types import Type

logger = logging.getLogger(__name__)


def _fighter(data: dict) -> Fighter:
    definition = data["species"]
    attacks = tuple(Attack(**{**attack, "type": Type(attack["type"]),
                             "category": Category(attack["category"])})
                    for attack in definition["attacks"])
    species = Species(definition["name"], tuple(Type(t) for t in definition["types"]),
                      Stats(**definition["stats"]), attacks)
    fighter = Fighter(data["id"], species, data["level"])
    fighter.hp = data["hp"]
    fighter.pp = data["pp"]
    return fighter


class _SqliteSession:
    """Lecture et écriture sur la connexion détenue par la transaction."""

    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection

    def save(self, record: StoredBattle) -> None:
        self.connection.execute(
            "INSERT INTO battles (id, snapshot) VALUES (?, ?) "
            "ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot",
            (str(record.id), json.dumps(asdict(record.battle), ensure_ascii=False)),
        )

    def get(self, battle_id: UUID) -> StoredBattle | None:
        row = self.connection.execute("SELECT snapshot FROM battles WHERE id = ?",
                                      (str(battle_id),)).fetchone()
        if row is None:
            return None
        data = json.loads(row[0])
        # Restaurer les PV après construction permet de relire les combats terminés.
        first, second = _fighter(data["first"]), _fighter(data["second"])
        first_hp, second_hp = first.hp, second.hp
        first.hp, second.hp = first.species.stats.hp, second.species.stats.hp
        battle = Battle(first, second, data["turn"])
        first.hp, second.hp = first_hp, second_hp
        return StoredBattle(battle_id, battle)


class SqliteBattleRepository:
    def __init__(self, path: str | Path):
        self.path = str(path)

    @contextmanager
    def _connection(self):
        try:
            with closing(sqlite3.connect(self.path)) as connection:
                with connection:
                    yield connection
        except sqlite3.Error:
            logger.exception("Échec de l'opération SQLite ; aucune écriture partielle validée")
            raise

    def initialize(self) -> None:
        with self._connection() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS battles (
                    id TEXT PRIMARY KEY NOT NULL,
                    snapshot TEXT NOT NULL
                )
            """)

    def save(self, record: StoredBattle) -> None:
        with self._connection() as connection:
            _SqliteSession(connection).save(record)

    def get(self, battle_id: UUID) -> StoredBattle | None:
        with self._connection() as connection:
            return _SqliteSession(connection).get(battle_id)

    @contextmanager
    def transaction(self):
        with self._connection() as connection:
            # Réserver l'écriture avant la lecture empêche deux tours de s'écraser.
            connection.execute("BEGIN IMMEDIATE")
            yield _SqliteSession(connection)
