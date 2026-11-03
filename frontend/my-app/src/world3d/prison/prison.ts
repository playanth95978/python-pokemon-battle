/** Plan et progression de la prison, sans dépendance au rendu. */
import type { Position, TileType, WorldMap } from '../../world/types'
export const PRISON_SPAWN = {x: 4, y: 10}, CELL_DOOR = {x: 7, y: 10}, WARDEN_SPAWN = {x: 9, y: 10}, PRISON_EXIT = {x: 12, y: 3}
export const PRISON_MAP: WorldMap = {
    width: 15, height: 16, tileSize: 32, props: [], buildings: [], landmarks: [],
    tiles: Array.from({length: 15 * 16}, (_, index): TileType => {
        const x = index % 15, y = Math.floor(index / 15)
        return x < 2 || x > 12 || y < 2 || y > 13 || (x === 7 && y >= 7) || (y === 7 && x <= 7)
            || (x === 2 && y >= 12) ? 'wall' : 'path'
    }),
}
export interface PrisonState {
    detained: boolean
    position: Position
    cellOpen: boolean
    guardDefeated: boolean
    keys: Position | null
    hasKeys: boolean
}
export function createPrison(detained = true): PrisonState {
    return {detained, position: detained ? {...PRISON_SPAWN} : {x: 11, y: 4}, cellOpen: !detained, guardDefeated: false, keys: null, hasKeys: false}
}
export function prisonPassable(state: PrisonState, position: Position): boolean {
    const {x, y} = position
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= PRISON_MAP.width || y >= PRISON_MAP.height) return false
    if (x === CELL_DOOR.x && y === CELL_DOOR.y) return state.cellOpen
    return PRISON_MAP.tiles[y * PRISON_MAP.width + x] === 'path'
}
export function defeatWarden(state: PrisonState, position: Position) {
    if (state.guardDefeated) return
    state.guardDefeated = true
    state.keys = {x: Math.floor(position.x), y: Math.floor(position.y)}
}
const near = (a: Position, b: Position, radius = 1.6) => Math.hypot(a.x - b.x, a.y - b.y) <= radius
export function prisonInteraction(state: PrisonState): 'challenge' | 'keys' | 'exit' | null {
    if (!state.guardDefeated && !state.cellOpen && near(state.position, CELL_DOOR, 2.5)) return 'challenge'
    if (state.keys && near(state.position, state.keys)) return 'keys'
    if (near(state.position, PRISON_EXIT)) return state.hasKeys || !state.detained ? 'exit' : null
    return null
}
export function interactPrison(state: PrisonState): ReturnType<typeof prisonInteraction> {
    const interaction = prisonInteraction(state)
    if (interaction === 'challenge') state.cellOpen = true
    if (interaction === 'keys') {state.hasKeys = true; state.keys = null}
    return interaction
}
