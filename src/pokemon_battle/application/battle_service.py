"""Cas d'usage de création et de consultation d'un combat."""

from collections.abc import Mapping
import logging
from random import Random
from uuid import uuid4, UUID

from pokemon_battle.domain import AttackAction, BattleAction, Fighter, Species, UsePotionAction
from pokemon_battle.engine import Battle, BattleEngine

from .battle_repository import BattleRepository, StoredBattle, StoredTurn, TurnResult

logger = logging.getLogger(__name__)


class UnknownSpeciesError(ValueError):
    pass


class BattleNotFoundError(ValueError):
    pass


class BattleFinishedError(ValueError):
    pass


class InvalidMoveError(ValueError):
    pass


class TurnConflictError(ValueError):
    pass


class BattleService:
    def __init__(self, repository: BattleRepository, catalog: Mapping[str, Species],
                 engine: BattleEngine | None = None):
        self.repository = repository
        self.catalog = dict(catalog)
        self.engine = engine if engine is not None else BattleEngine(Random())

    def create_battle(self, first_species: str, second_species: str, *,
                      first_level: int = 50, first_potions: int = 2) -> StoredBattle:
        species = []
        for name in (first_species, second_species):
            key = name.strip().casefold()
            if key not in self.catalog:
                logger.warning("Création refusée : espèce inconnue %r", name)
                raise UnknownSpeciesError(f"Espèce inconnue : {name}")
            species.append(self.catalog[key])
        first = Fighter(str(uuid4()), species[0], first_level)
        if first_potions < 0:
            raise ValueError("first_potions must not be negative")
        first.potions = first_potions
        record = StoredBattle(uuid4(), Battle(first, Fighter(str(uuid4()), species[1])))
        self.repository.save(record)
        logger.info("Combat créé id=%s premier=%s second=%s", record.id,
                    record.battle.first.species.name, record.battle.second.species.name)
        return record

    def get_battle(self, battle_id: UUID) -> StoredBattle | None:
        """Lire l'instantané sauvegardé, indépendamment du catalogue actuel."""
        return self.repository.get(battle_id)

    def play_turn(self, battle_id: UUID, first_move: int | BattleAction, second_move: int | BattleAction, *,
                  expected_turn: int, idempotency_key: UUID) -> TurnResult:
        """Lire, résoudre et sauvegarder sous une même transaction."""
        if type(expected_turn) is not int or expected_turn < 0 or not isinstance(idempotency_key, UUID):
            raise InvalidMoveError("Le tour attendu et une clé UUID sont obligatoires")
        first_move, second_move = self.normalize_action(first_move), self.normalize_action(second_move)
        with self.repository.transaction() as session:
            result = self.resolve_turn(session, battle_id, first_move, second_move,
                                       expected_turn=expected_turn, idempotency_key=idempotency_key)
        logger.info("Tour enregistré id=%s tour=%s", battle_id, result.record.battle.turn)
        return result

    def normalize_action(self, action: int | BattleAction) -> BattleAction:
        if type(action) is int:
            action = AttackAction(action)
        if not isinstance(action, (AttackAction, UsePotionAction)):
            raise InvalidMoveError("Action de combat invalide")
        if isinstance(action, AttackAction) and (type(action.attack_slot) is not int or not 0 <= action.attack_slot <= 3):
            raise InvalidMoveError("L'attaque choisie n'existe pas")
        return action

    def validate_action(self, fighter: Fighter, action: BattleAction) -> None:
        if isinstance(action, UsePotionAction):
            if fighter.knocked_out or fighter.hp >= fighter.species.stats.hp or fighter.potions <= 0:
                raise InvalidMoveError("Potion indisponible : PV pleins, combattant KO ou stock vide")
        elif action.attack_slot >= len(fighter.pp):
            raise InvalidMoveError("L'attaque choisie n'existe pas")
        elif fighter.pp[action.attack_slot] <= 0:
            raise InvalidMoveError("L'attaque choisie n'a plus de PP")

    def resolve_turn(self, session, battle_id: UUID, first_move: int | BattleAction, second_move: int | BattleAction, *,
                     expected_turn: int, idempotency_key: UUID) -> TurnResult:
        """Résoudre dans la transaction de l'appelant, sans appel réseau."""
        first_move, second_move = self.normalize_action(first_move), self.normalize_action(second_move)
        receipt = session.get_turn(battle_id, idempotency_key)
        # Rejouer la réponse avant toute vérification de l'état actuel (même après KO).
        if receipt is not None:
            if (receipt.expected_turn, receipt.first_action, receipt.second_action) != (
                expected_turn, first_move, second_move,
            ):
                raise TurnConflictError("Cette clé d'idempotence a déjà été utilisée avec un autre contenu")
            logger.info("Réponse de tour réutilisée id=%s clé=%s", battle_id, idempotency_key)
            return receipt.result
        record = session.get(battle_id)
        if record is None:
            logger.warning("Tour refusé : combat absent id=%s", battle_id)
            raise BattleNotFoundError("Le combat n'existe pas")
        if record.battle.is_over:
            logger.warning("Tour refusé : combat terminé id=%s", battle_id)
            raise BattleFinishedError("Le combat est déjà terminé")
        if record.battle.turn != expected_turn:
            raise TurnConflictError("Le combat a évolué. Relis son état avant de jouer")
        # Ces vérifications donnent des messages métier sans masquer une panne du moteur.
        for fighter, move in ((record.battle.first, first_move), (record.battle.second, second_move)):
            self.validate_action(fighter, move)
        events = self.engine.play_turn(record.battle, first_move, second_move)
        session.save(record)
        result = TurnResult(record, events)
        session.save_turn(battle_id, idempotency_key, StoredTurn(
            expected_turn, first_move, second_move, result,
        ))
        # Le succès HTTP attend la validation de la transaction appelante.
        logger.info("Tour résolu id=%s tour=%s pv_premier=%s pv_second=%s",
                    battle_id, record.battle.turn, record.battle.first.hp, record.battle.second.hp)
        for event in events:
            logger.debug("Événement id=%s %s", battle_id, event)
        if record.battle.is_over:
            logger.info("Combat terminé id=%s vainqueur=%s", battle_id, record.battle.winner)
        return result
