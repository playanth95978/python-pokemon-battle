import type { Position } from '../world/types'

/** Identité d'un Pokémon rencontrable, indépendante de son modèle d'affichage. */
export interface WorldPokemon {
    id: string
    speciesKey: string
    position: Position
}
