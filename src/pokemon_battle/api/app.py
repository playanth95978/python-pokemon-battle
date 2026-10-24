"""Point d'entrée FastAPI ; le domaine reste indépendant de cette couche."""

from contextlib import asynccontextmanager
import logging
from pathlib import Path

from fastapi import FastAPI

from pokemon_battle.application.battle_service import BattleService
from pokemon_battle.application.catalog import CATALOG
from pokemon_battle.infrastructure.sqlite_battle_repository import SqliteBattleRepository

from .battle_controller import router
from .catalogue_controller import router as catalogue_router

def create_app(database_path: str | Path = "battles.sqlite3") -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logging.basicConfig(level=logging.INFO,
                            format="%(levelname)s %(name)s | %(message)s")
        repository = SqliteBattleRepository(database_path)
        repository.initialize()
        app.state.battle_service = BattleService(repository, CATALOG)
        yield

    app = FastAPI(title="Pokémon Battle API", lifespan=lifespan)
    app.include_router(router)
    app.include_router(catalogue_router)
    return app


app = create_app()
