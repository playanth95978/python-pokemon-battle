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
from pokemon_battle.domain import Attack, BattleStat, Category, Fighter, Species, Stats, StatusCondition, StatStages, \
    AttackEffect, ApplyStatus, ModifyStat, Protect
from pokemon_battle.engine import (
    Battle, AttackBlocked, AttackUsed, AttackMissed, BurnDamage, DamageDealt, EffectFailed, FailureReason,
    FullyParalyzed, KnockedOut, BattleEnded, PotionUsed, ProtectionActivated, StatChanged, StatusApplied,
)
from pokemon_battle.types import Type
from pokemon_battle.domain import AttackAction, BattleAction, UsePotionAction

logger = logging.getLogger(__name__)

# Liste explicite des événements autorisés à être reconstruits depuis les reçus.
EVENT_CLASSES = {
    event.__name__: event
    for event in (AttackUsed, AttackMissed, DamageDealt, KnockedOut, BattleEnded, PotionUsed,
                  FullyParalyzed, AttackBlocked, StatusApplied, StatChanged, ProtectionActivated,
                  EffectFailed, BurnDamage)
}


def _serialize_action(action: BattleAction) -> dict:
    if isinstance(action, AttackAction):
        return {"action_type": "attack", "attack_slot": action.attack_slot}
    if isinstance(action, UsePotionAction):
        return {"action_type": "potion"}
    raise ValueError("Action de combat inconnue")


def _serialize_effect(effect: AttackEffect) -> dict:
    """Effet marqué par "effect_type" : asdict seul perdrait sa classe (Protect() deviendrait {})."""
    if isinstance(effect, ApplyStatus):
        return {"effect_type": "apply_status", "condition": effect.condition.value}
    if isinstance(effect, ModifyStat):
        return {"effect_type": "modify_stat", "stat": effect.stat.value, "stages": effect.stages}
    if isinstance(effect, Protect):
        return {"effect_type": "protect"}
    raise ValueError("Effet d'attaque inconnu")


def _deserialize_effect(data: dict) -> AttackEffect:
    effect_type = data.get("effect_type")
    if effect_type == "apply_status":
        return ApplyStatus(StatusCondition(data["condition"]))
    if effect_type == "modify_stat":
        return ModifyStat(BattleStat(data["stat"]), data["stages"])
    if effect_type == "protect":
        return Protect()
    raise ValueError("Effet d'attaque inconnu")


def _battle_snapshot(battle: Battle) -> dict:
    """Instantané JSON du combat ; les effets gardent leur type pour pouvoir être relus."""
    # 1. Partir de asdict(battle).
    data = asdict(battle)
    # 2. Pour chaque combattant, retrouver l'objet Fighter d'origine.
    for key in ("first", "second"):
        fighter = getattr(battle, key)
        # 3. Remplacer les effets abîmés par asdict par leur version typée.
        for i, attack in enumerate(fighter.species.attacks):
            data[key]["species"]["attacks"][i]["effects"] = [
                _serialize_effect(effect) for effect in attack.effects
            ]
    # 4. Renvoyer le dictionnaire.
    return data


def _deserialize_action(data: dict) -> BattleAction:
    action_type = data.get("action_type", data.get("kind"))
    if action_type == "attack":
        attack_slot = data.get("attack_slot", data.get("slot"))
        if type(attack_slot) is not int or not 0 <= attack_slot <= 3:
            raise ValueError("Emplacement d'attaque enregistré invalide")
        return AttackAction(attack_slot=attack_slot)
    if action_type == "potion":
        return UsePotionAction()
    raise ValueError("Action de combat inconnue")


def _fighter(data: dict) -> Fighter:
    definition = data["species"]
    # Les instantanés antérieurs aux attaques de statut n'ont pas de clé "effects".
    attacks = tuple(Attack(**{**attack, "type": Type(attack["type"]),
                              "category": Category(attack["category"]),
                              "effects": tuple(_deserialize_effect(effect)
                                               for effect in attack.get("effects", []))})
                    for attack in definition["attacks"])
    species = Species(definition["name"], tuple(Type(t) for t in definition["types"]),
                      Stats(**definition["stats"]), attacks)
    fighter = Fighter(data["id"], species, data["level"])
    fighter.hp = data["hp"]
    fighter.pp = data["pp"]
    fighter.potions = data.get("potions", 2)
    saved_status = data.get("status")

    fighter.status = (
        StatusCondition(saved_status)
        if saved_status is not None
        else None
    )

    fighter.stat_stages = StatStages(**data.get("stat_stages", {}))
    fighter.protected = data.get("protected", False)
    fighter.protected_last_turn = data.get("protected_last_turn", False)
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

    def get_ai_state(self, battle_id: UUID) -> dict | None:
        row = self.connection.execute("SELECT state FROM battle_ai_sessions WHERE battle_id = ?",
                                      (str(battle_id),)).fetchone()
        return json.loads(row[0]) if row else None

    def save_ai_state(self, battle_id: UUID, state: dict) -> None:
        self.connection.execute(
            "INSERT INTO battle_ai_sessions (battle_id, state) VALUES (?, ?) "
            "ON CONFLICT(battle_id) DO UPDATE SET state = excluded.state",
            (str(battle_id), json.dumps(state, ensure_ascii=False)))

    def get_ai_request(self, battle_id: UUID, key: UUID) -> dict | None:
        row = self.connection.execute("SELECT request FROM battle_ai_requests WHERE battle_id = ? AND request_key = ?",
                                      (str(battle_id), str(key))).fetchone()
        return json.loads(row[0]) if row else None

    def save_ai_request(self, battle_id: UUID, key: UUID, request: dict) -> None:
        self.connection.execute("INSERT INTO battle_ai_requests (battle_id, request_key, request) VALUES (?, ?, ?)",
                                (str(battle_id), str(key), json.dumps(request, ensure_ascii=False)))

    def save(self, record: StoredBattle) -> None:
        self.connection.execute(
            "INSERT INTO battles (id, snapshot) VALUES (?, ?) "
            "ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot",
            (str(record.id), json.dumps(_battle_snapshot(record.battle), ensure_ascii=False)),
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
        events = []
        for item in data["events"]:
            event_type = item.pop("type")
            event_class = EVENT_CLASSES.get(event_type)
            if event_class is None:
                raise ValueError(f"Type d'événement enregistré inconnu : {event_type!r}")
            if event_type == "DamageDealt":
                item["effectiveness"] = Fraction(item["effectiveness"])
            if event_type == "AttackUsed" and item.get("attack_type") is not None:
                item["attack_type"] = Type(item["attack_type"])
            if event_type == "StatusApplied":
                item["condition"] = StatusCondition(item["condition"])
            if event_type == "StatChanged":
                item["stat"] = BattleStat(item["stat"])
            if event_type == "EffectFailed":
                item["reason"] = FailureReason(item["reason"])
            events.append(event_class(**item))
        result = TurnResult(_record(battle_id, data["battle"]), tuple(events))
        first_action = _deserialize_action(data["first_action"]) if "first_action" in data else AttackAction(row[1])
        second_action = _deserialize_action(data["second_action"]) if "second_action" in data else AttackAction(row[2])
        return StoredTurn(row[0], first_action, second_action, result)

    def save_turn(self, battle_id: UUID, key: UUID, receipt: StoredTurn) -> None:
        events = []
        for event in receipt.result.events:
            item = {"type": type(event).__name__, **asdict(event)}
            if isinstance(event, DamageDealt):
                item["effectiveness"] = str(event.effectiveness)
            events.append(item)
        snapshot = json.dumps({"battle": _battle_snapshot(receipt.result.record.battle), "events": events,
                               "first_action": _serialize_action(receipt.first_action),
                               "second_action": _serialize_action(receipt.second_action)},
                              ensure_ascii=False)
        self.connection.execute(
            "INSERT INTO battle_turns "
            "(battle_id, idempotency_key, expected_turn, first_move, second_move, result) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            # Les colonnes historiques restent pour les anciennes bases ; -1 n'est jamais interprété comme une attaque.
            (str(battle_id), str(key), receipt.expected_turn,
             receipt.first_action.attack_slot if isinstance(receipt.first_action, AttackAction) else -1,
             receipt.second_action.attack_slot if isinstance(receipt.second_action, AttackAction) else -1, snapshot),
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
            connection.execute("""
                CREATE TABLE IF NOT EXISTS battle_ai_sessions (
                    battle_id TEXT PRIMARY KEY NOT NULL REFERENCES battles(id),
                    state TEXT NOT NULL
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS battle_ai_requests (
                    battle_id TEXT NOT NULL REFERENCES battles(id),
                    request_key TEXT NOT NULL,
                    request TEXT NOT NULL,
                    PRIMARY KEY (battle_id, request_key)
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
