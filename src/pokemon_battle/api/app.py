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
from pokemon_battle.application.ai.ai_battle_service import AiBattleService
from pokemon_battle.core.config import Settings
from pokemon_battle.mistral.client import MistralClient
from pokemon_battle.mistral.conversation_adapter import MistralConversationAdapter

def create_app(database_path: str | Path = "battles.sqlite3", *, conversation_adapter_factory=None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logging.basicConfig(level=logging.INFO,
                            format="%(levelname)s %(name)s | %(message)s")
        repository = SqliteBattleRepository(database_path)
        repository.initialize()
        app.state.battle_service = BattleService(repository, CATALOG)
        client = None
        def adapter_factory(state, memory):
            nonlocal client
            if client is None:
                # Configuration chargée seulement à l'usage de l'IA ; jamais de clé dans React.
                client = MistralClient(Settings())
            return MistralConversationAdapter(client, state, memory)
        app.state.ai_battle_service = AiBattleService(app.state.battle_service,
                                                     conversation_adapter_factory or adapter_factory)
        try:
            yield
        finally:
            if client is not None:
                await client.aclose()

    app = FastAPI(title="Pokémon Battle API", lifespan=lifespan)
    app.include_router(router)
    app.include_router(catalogue_router)
    return app


app = create_app()
