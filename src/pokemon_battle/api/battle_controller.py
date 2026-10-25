"""Routes HTTP de création, consultation et exécution des combats."""

from uuid import UUID

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from pokemon_battle.application.battle_service import (
    BattleService, UnknownSpeciesError, BattleNotFoundError, BattleFinishedError, InvalidMoveError, TurnConflictError,
)

from .dependencies import get_battle_service, get_ai_battle_service
from .schemas import BattleResponse, CreateBattleRequest, PlayTurnRequest, PlayTurnResponse, PlayAiTurnRequest, PlayAiTurnResponse
from pokemon_battle.application.ai.ai_battle_service import AiBattleService
from .schemas import PlayActionTurnRequest, PlayAiActionTurnRequest

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
    request: PlayTurnRequest | PlayActionTurnRequest,
    service: Annotated[BattleService, Depends(get_battle_service)],
) -> PlayTurnResponse:
    """Résoudre un tour et retourner l'état enregistré avec ses événements."""
    try:
        first = request.first_action.to_domain() if isinstance(request, PlayActionTurnRequest) else request.first_move
        second = request.second_action.to_domain() if isinstance(request, PlayActionTurnRequest) else request.second_move
        result = service.play_turn(battle_id, first, second,
                                   expected_turn=request.expected_turn, idempotency_key=request.idempotency_key)
    except BattleNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except (BattleFinishedError, TurnConflictError) as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except InvalidMoveError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    return PlayTurnResponse.from_result(result)


@router.post("/{battle_id}/ai-turns", response_model=PlayAiTurnResponse, summary="Jouer contre l'IA Mistral")
async def play_ai_turn(battle_id: UUID, request: PlayAiTurnRequest | PlayAiActionTurnRequest,
                       service: Annotated[AiBattleService, Depends(get_ai_battle_service)]) -> PlayAiTurnResponse:
    """Le premier combattant est humain ; le second choisit avec ses outils et sa conversation."""
    try:
        action = request.player_action.to_domain() if isinstance(request, PlayAiActionTurnRequest) else request.player_move
        result = await service.play_turn(battle_id, action, expected_turn=request.expected_turn,
                                         idempotency_key=request.idempotency_key)
    except BattleNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (BattleFinishedError, TurnConflictError) as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except InvalidMoveError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    response = PlayTurnResponse.from_result(result.turn)
    return PlayAiTurnResponse(**response.model_dump(), decision=result.decision, metrics=result.metrics)
