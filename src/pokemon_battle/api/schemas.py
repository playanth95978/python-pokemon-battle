"""Contrats d'entrée des routes de combat."""

from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from dataclasses import asdict
from typing import Annotated, Literal

from pokemon_battle.application.battle_repository import StoredBattle
from pokemon_battle.application.battle_service import TurnResult
from pokemon_battle.domain import Fighter
from pokemon_battle.types import Type
from pokemon_battle.engine import AttackUsed, AttackMissed, DamageDealt, KnockedOut, BattleEnded, DomainEvent


class CreateBattleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_species: str = Field(min_length=1, pattern=r"\S")
    second_species: str = Field(min_length=1, pattern=r"\S")


class PlayTurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_move: int = Field(ge=0, le=3, strict=True)
    second_move: int = Field(ge=0, le=3, strict=True)
    expected_turn: int = Field(ge=0, strict=True)
    idempotency_key: UUID


class PlayAiTurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    player_move: int = Field(ge=0, le=3, strict=True)
    expected_turn: int = Field(ge=0, strict=True)
    idempotency_key: UUID


class AttackResponse(BaseModel):
    slot: int
    name: str
    pp: int
    max_pp: int


class FighterResponse(BaseModel):
    id: str
    species: str
    level: int
    hp: int
    max_hp: int
    attacks: list[AttackResponse]

    @classmethod
    def from_fighter(cls, fighter: Fighter) -> "FighterResponse":
        return cls(id=fighter.id, species=fighter.species.name, level=fighter.level,
                   hp=fighter.hp, max_hp=fighter.species.stats.hp,
                   attacks=[AttackResponse(slot=i, name=attack.name, pp=fighter.pp[i],
                                           max_pp=attack.max_pp)
                            for i, attack in enumerate(fighter.species.attacks)])


class BattleResponse(BaseModel):
    id: UUID
    turn: int
    first: FighterResponse
    second: FighterResponse
    winner: str | None

    @classmethod
    def from_record(cls, record: StoredBattle) -> "BattleResponse":
        return cls(id=record.id, turn=record.battle.turn,
                   first=FighterResponse.from_fighter(record.battle.first),
                   second=FighterResponse.from_fighter(record.battle.second),
                   winner=record.battle.winner)


class AttackUsedResponse(BaseModel):
    type: Literal["attack_used"] = "attack_used"
    turn: int
    actor: str
    target: str
    attack: str
    pp_remaining: int
    attack_type: Type | None = None
    attack_slot: int | None = None


class AttackMissedResponse(BaseModel):
    type: Literal["attack_missed"] = "attack_missed"
    turn: int
    actor: str
    target: str


class DamageDealtResponse(BaseModel):
    type: Literal["damage_dealt"] = "damage_dealt"
    turn: int
    actor: str
    target: str
    damage: int
    hp_remaining: int
    effectiveness: float


class KnockedOutResponse(BaseModel):
    type: Literal["knocked_out"] = "knocked_out"
    turn: int
    fighter: str


class BattleEndedResponse(BaseModel):
    type: Literal["battle_ended"] = "battle_ended"
    turn: int
    winner: str


EventResponse = Annotated[
    AttackUsedResponse | AttackMissedResponse | DamageDealtResponse | KnockedOutResponse | BattleEndedResponse,
    Field(discriminator="type"),
]


def event_response(event: DomainEvent) -> EventResponse:
    data = asdict(event)
    if isinstance(event, DamageDealt):
        # Les multiplicateurs de types sont des puissances de deux, exactes en JSON numérique.
        return DamageDealtResponse(**{**data, "effectiveness": float(event.effectiveness)})
    models = {
        AttackUsed: AttackUsedResponse,
        AttackMissed: AttackMissedResponse,
        KnockedOut: KnockedOutResponse,
        BattleEnded: BattleEndedResponse,
    }
    return models[type(event)](**data)


class PlayTurnResponse(BaseModel):
    battle: BattleResponse
    events: list[EventResponse]

    @classmethod
    def from_result(cls, result: TurnResult) -> "PlayTurnResponse":
        return cls(battle=BattleResponse.from_record(result.record),
                   events=[event_response(event) for event in result.events])


class AiDecisionResponse(BaseModel):
    slot: int
    source: Literal["llm", "local"]
    comment: str
    fallback_reason: str | None


class PlayAiTurnResponse(PlayTurnResponse):
    decision: AiDecisionResponse
    metrics: dict
