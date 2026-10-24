"""Persistance d'instantanés : les combats ne dépendent pas du catalogue futur."""

import json
import logging
import sqlite3
from contextlib import closing, contextmanager
from dataclasses import asdict
from fractions import Fraction
from pathlib import Path
from uuid import UUID

from pokemon_battle.application.battle_repository import StoredBattle, StoredTurn, TurnResult
from pokemon_battle.domain import Attack, Category, Fighter, Species, Stats
from pokemon_battle.engine import Battle, AttackUsed, AttackMissed, DamageDealt, KnockedOut, BattleEnded
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


def _record(battle_id: UUID, data: dict) -> StoredBattle:
    first, second = _fighter(data["first"]), _fighter(data["second"])
    first_hp, second_hp = first.hp, second.hp
    first.hp, second.hp = first.species.stats.hp, second.species.stats.hp
    battle = Battle(first, second, data["turn"])
    first.hp, second.hp = first_hp, second_hp
    return StoredBattle(battle_id, battle)


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
        return _record(battle_id, json.loads(row[0]))

    def get_turn(self, battle_id: UUID, key: UUID) -> StoredTurn | None:
        row = self.connection.execute(
            "SELECT expected_turn, first_move, second_move, result FROM battle_turns "
            "WHERE battle_id = ? AND idempotency_key = ?", (str(battle_id), str(key)),
        ).fetchone()
        if row is None:
            return None
        data = json.loads(row[3])
        classes = {cls.__name__: cls for cls in (AttackUsed, AttackMissed, DamageDealt, KnockedOut, BattleEnded)}
        events = []
        for item in data["events"]:
            kind = item.pop("type")
            if kind == "DamageDealt":
                item["effectiveness"] = Fraction(item["effectiveness"])
            if kind == "AttackUsed" and item.get("attack_type") is not None:
                item["attack_type"] = Type(item["attack_type"])
            events.append(classes[kind](**item))
        result = TurnResult(_record(battle_id, data["battle"]), tuple(events))
        return StoredTurn(row[0], row[1], row[2], result)

    def save_turn(self, battle_id: UUID, key: UUID, receipt: StoredTurn) -> None:
        events = []
        for event in receipt.result.events:
            item = {"type": type(event).__name__, **asdict(event)}
            if isinstance(event, DamageDealt):
                item["effectiveness"] = str(event.effectiveness)
            events.append(item)
        snapshot = json.dumps({"battle": asdict(receipt.result.record.battle), "events": events},
                              ensure_ascii=False)
        self.connection.execute(
            "INSERT INTO battle_turns "
            "(battle_id, idempotency_key, expected_turn, first_move, second_move, result) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (str(battle_id), str(key), receipt.expected_turn, receipt.first_move, receipt.second_move, snapshot),
        )


class SqliteBattleRepository:
    def __init__(self, path: str | Path):
        self.path = str(path)

    @contextmanager
    def _connection(self):
        try:
            with closing(sqlite3.connect(self.path)) as connection:
                connection.execute("PRAGMA foreign_keys = ON")
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
            connection.execute("""
                CREATE TABLE IF NOT EXISTS battle_turns (
                    battle_id TEXT NOT NULL REFERENCES battles(id),
                    idempotency_key TEXT NOT NULL,
                    expected_turn INTEGER NOT NULL CHECK (expected_turn >= 0),
                    first_move INTEGER NOT NULL,
                    second_move INTEGER NOT NULL,
                    result TEXT NOT NULL,
                    PRIMARY KEY (battle_id, idempotency_key),
                    UNIQUE (battle_id, expected_turn)
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
