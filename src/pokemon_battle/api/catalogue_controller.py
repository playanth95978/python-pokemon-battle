"""Catalogue de sélection ; le moteur garde l'autorité sur les combats."""

from fastapi import APIRouter
from pydantic import BaseModel

from pokemon_battle.application.pokemon_catalogue import catalogue_metadata


class PokemonEntry(BaseModel):
    id: int
    pokemon_id: int
    key: str
    name: str
    genus: str
    generation: int
    types: list[str]
    legendary: bool
    mythical: bool
    baby: bool
    versions: list[int]
    fallback_attack: bool


class GenerationEntry(BaseModel):
    id: int
    name: str
    release_date: str


class VersionEntry(BaseModel):
    id: int
    key: str
    name: str
    generation: int
    release_date: str | None
    order: int


class TypeEntry(BaseModel):
    key: str
    name: str


class CatalogueResponse(BaseModel):
    source: str
    updated_at: str
    species: list[PokemonEntry]
    generations: list[GenerationEntry]
    versions: list[VersionEntry]
    types: list[TypeEntry]


router = APIRouter(tags=["Catalogue"])


@router.get("/catalogue", response_model=CatalogueResponse, summary="Consulter le catalogue Pokémon")
def get_catalogue() -> dict:
    return catalogue_metadata()
