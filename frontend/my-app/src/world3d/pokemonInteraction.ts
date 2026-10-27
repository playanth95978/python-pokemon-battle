import type { Position } from '../world/types'
import type { WorldPokemon } from './worldPokemon'

export function canInteractWithPokemon(playerPosition: Position, pokemon: WorldPokemon,): boolean {
    const distance = Math.abs(playerPosition.x - pokemon.position.x) + Math.abs(playerPosition.y - pokemon.position.y)
    return distance <= 1
}