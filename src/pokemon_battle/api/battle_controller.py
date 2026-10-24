"""Routes HTTP de création, consultation et exécution des combats."""

from uuid import UUID

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from pokemon_battle.application.battle_service import (
    BattleService, UnknownSpeciesError, BattleNotFoundError, BattleFinishedError, InvalidMoveError,
)

from .dependencies import get_battle_service
from .schemas import BattleResponse, CreateBattleRequest, PlayTurnRequest, PlayTurnResponse

router = APIRouter(prefix="/battles", tags=["Combats"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=BattleResponse, summary="Créer un combat")
def create_battle(
    request: CreateBattleRequest,
    service: Annotated[BattleService, Depends(get_battle_service)],
) -> BattleResponse:
    """Créer et enregistrer un combat à partir de deux espèces du catalogue."""
    try:
        record = service.create_battle(request.first_species, request.second_species)
    except UnknownSpeciesError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    return BattleResponse.from_record(record)


@router.get(
    "/{battle_id}",
    status_code=status.HTTP_200_OK,
    response_model=BattleResponse,
    summary="Consulter un combat",
)
def get_battle(
    battle_id: UUID,
    service: Annotated[BattleService, Depends(get_battle_service)],
) -> BattleResponse:
    """Retourner l'état sauvegardé du combat, ou 404 s'il n'existe pas."""
    record = service.get_battle(battle_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Le combat n'existe pas",
        )
    return BattleResponse.from_record(record)


@router.post("/{battle_id}/turns", status_code=status.HTTP_200_OK,
             response_model=PlayTurnResponse, summary="Jouer un tour")
def play_turn(
    battle_id: UUID,
    request: PlayTurnRequest,
    service: Annotated[BattleService, Depends(get_battle_service)],
) -> PlayTurnResponse:
    """Résoudre un tour et retourner l'état enregistré avec ses événements."""
    try:
        result = service.play_turn(battle_id, request.first_move, request.second_move)
    except BattleNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except BattleFinishedError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except InvalidMoveError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    return PlayTurnResponse.from_result(result)
