"""Injection des dépendances de l'application."""

from fastapi import Request

from pokemon_battle.application.battle_service import BattleService


def get_battle_service(request: Request) -> BattleService:
    return request.app.state.battle_service
