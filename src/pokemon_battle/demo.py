"""Exemple reproductible : python -m pokemon_battle.demo --seed 42 --debug."""

import argparse
import logging
from pathlib import Path
from random import Random
from tempfile import TemporaryDirectory
from uuid import uuid4

from .application.battle_service import BattleService
from .application.catalog import CATALOG
from .engine import BattleEngine
from .infrastructure.sqlite_battle_repository import SqliteBattleRepository


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Combat de démonstration Bulbizarre contre Salamèche")
    parser.add_argument("--seed", type=int, default=42, help="Graine du hasard (42 par défaut)")
    parser.add_argument("--debug", action="store_true", help="Afficher les événements détaillés")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.debug else logging.INFO,
                        format="%(levelname)s %(name)s | %(message)s")

    # La démonstration utilise sa propre base pour ne pas toucher aux combats de l'API.
    with TemporaryDirectory(prefix="pokemon-battle-") as directory:
        repository = SqliteBattleRepository(Path(directory) / "demo.sqlite3")
        repository.initialize()
        service = BattleService(repository, CATALOG, BattleEngine(Random(args.seed)))
        record = service.create_battle("bulbizarre", "salameche")
        battle = record.battle
        print(f"{battle.first.species.name} contre {battle.second.species.name} (graine {args.seed})")
        while battle.winner is None:
            # Préférer l'attaque élémentaire, puis Charge si ses PP sont épuisés.
            moves = [next((attack_slot for attack_slot in (1, 0) if fighter.pp[attack_slot] > 0), None)
                     for fighter in (battle.first, battle.second)]
            if None in moves:
                print("Combat interrompu : toutes les attaques d'un combattant sont épuisées.")
                return
            result = service.play_turn(record.id, moves[0], moves[1],
                                       expected_turn=battle.turn, idempotency_key=uuid4())
            battle = result.record.battle
            print(f"Tour {battle.turn} : {battle.first.species.name} {battle.first.hp} PV | "
                  f"{battle.second.species.name} {battle.second.hp} PV")
        winner = battle.first if battle.winner == battle.first.id else battle.second
        print(f"Vainqueur : {winner.species.name}")


if __name__ == "__main__":
    main()
