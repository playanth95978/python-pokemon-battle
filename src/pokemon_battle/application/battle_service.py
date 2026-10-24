"""Cas d'usage de création et de consultation d'un combat."""

from collections.abc import Mapping
import logging
from random import Random
from uuid import uuid4, UUID

from pokemon_battle.domain import Fighter, Species
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

    def create_battle(self, first_species: str, second_species: str) -> StoredBattle:
        species = []
        for name in (first_species, second_species):
            key = name.strip().casefold()
            if key not in self.catalog:
                logger.warning("Création refusée : espèce inconnue %r", name)
                raise UnknownSpeciesError(f"Espèce inconnue : {name}")
            species.append(self.catalog[key])
        record = StoredBattle(
            uuid4(),
            Battle(Fighter(str(uuid4()), species[0]), Fighter(str(uuid4()), species[1])),
        )
        self.repository.save(record)
        logger.info("Combat créé id=%s premier=%s second=%s", record.id,
                    record.battle.first.species.name, record.battle.second.species.name)
        return record

    def get_battle(self, battle_id: UUID) -> StoredBattle | None:
        """Lire l'instantané sauvegardé, indépendamment du catalogue actuel."""
        return self.repository.get(battle_id)

    def play_turn(self, battle_id: UUID, first_move: int, second_move: int, *,
                  expected_turn: int, idempotency_key: UUID) -> TurnResult:
        """Lire, résoudre et sauvegarder sous une même transaction."""
        if type(expected_turn) is not int or expected_turn < 0 or not isinstance(idempotency_key, UUID):
            raise InvalidMoveError("Le tour attendu et une clé UUID sont obligatoires")
        if type(first_move) is not int or type(second_move) is not int:
            raise InvalidMoveError("Les indices d'attaque doivent être des entiers")
        with self.repository.transaction() as session:
            receipt = session.get_turn(battle_id, idempotency_key)
            # Rejouer la réponse avant toute vérification de l'état actuel (même après KO).
            if receipt is not None:
                if (receipt.expected_turn, receipt.first_move, receipt.second_move) != (
                    expected_turn, first_move, second_move,
                ):
                    raise TurnConflictError("Cette clé d'idempotence a déjà été utilisée avec un autre contenu")
                logger.info("Réponse de tour réutilisée id=%s clé=%s", battle_id, idempotency_key)
                return receipt.result
            record = session.get(battle_id)
            if record is None:
                logger.warning("Tour refusé : combat absent id=%s", battle_id)
                raise BattleNotFoundError("Le combat n'existe pas")
            if record.battle.winner is not None:
                logger.warning("Tour refusé : combat terminé id=%s", battle_id)
                raise BattleFinishedError("Le combat est déjà terminé")
            if record.battle.turn != expected_turn:
                raise TurnConflictError("Le combat a évolué. Relis son état avant de jouer")
            # Ces vérifications donnent des messages métier sans masquer une panne du moteur.
            for fighter, move in ((record.battle.first, first_move), (record.battle.second, second_move)):
                if type(move) is not int or not 0 <= move < len(fighter.species.attacks):
                    logger.warning("Tour refusé : attaque invalide id=%s combattant=%s choix=%r",
                                   battle_id, fighter.id, move)
                    raise InvalidMoveError("L'attaque choisie n'existe pas")
                if fighter.pp[move] <= 0:
                    logger.warning("Tour refusé : PP épuisés id=%s combattant=%s choix=%s",
                                   battle_id, fighter.id, move)
                    raise InvalidMoveError("L'attaque choisie n'a plus de PP")
            events = self.engine.play_turn(record.battle, first_move, second_move)
            session.save(record)
            result = TurnResult(record, events)
            session.save_turn(battle_id, idempotency_key, StoredTurn(
                expected_turn, first_move, second_move, result,
            ))
        # Ne rendre un succès qu'après validation de l'écriture.
        logger.info("Tour enregistré id=%s tour=%s pv_premier=%s pv_second=%s",
                    battle_id, record.battle.turn, record.battle.first.hp, record.battle.second.hp)
        for event in events:
            logger.debug("Événement id=%s %s", battle_id, event)
        if record.battle.winner is not None:
            logger.info("Combat terminé id=%s vainqueur=%s", battle_id, record.battle.winner)
        return result
