/**
 * Crue de Clairbois : une hauteur d'eau par case, qui s'écoule vers les cases voisines plus basses (modèle des
 * « tuyaux virtuels » des jeux de bac à sable : un débit par côté, accéléré par la différence de niveau).
 * Deux sources : la rivière et le lac, dont le niveau monte pendant un orage et déborde dans la vallée ; et la nappe,
 * qui remonte sous la pluie et remplit les cuvettes par en dessous. Maisons et château arrêtent l'eau.
 * Module pur : la vue ne lit que `depth`, `ground` et `mud`.
 */
import type { Position, WorldMap } from '../../world/types'
import { tileAt } from '../../world/worldMap'
import type { Terrain } from '../terrain'
import { BED_DEPTH, RIVER_LEVEL } from '../terrain'

/** Pas fixe de la simulation, en secondes réelles : l'écoulement reste stable quelle que soit la cadence d'image. */
const STEP = 1 / 30
const MAX_STEPS = 4
const GRAVITY = 9.8
/** Le débit s'amortit à chaque pas : l'eau ne clapote pas indéfiniment d'un bord à l'autre. */
const DAMPING = 0.985
/** L'eau sourd jusqu'à la nappe (part de l'écart comblée par seconde) ; au-dessus, le sol boit (mètres par seconde). */
const SEEPAGE = 0.2, SOAK_IN = 0.0025
/** Au-dessus de cette hauteur d'eau, une case est mouillée (sol boueux, eau visible). */
export const WET = 0.04
/** Au-delà, on ne passe plus à pied. */
export const WADE = 0.25
/** Une case noyée reste boueuse quelques heures (en secondes réelles). */
const MUD_SECONDS = 240
/** Sous le sol, là où l'eau n'est pas : la surface y passe sous le terrain. */
const DRY = -0.4

/** Sens des quatre débits d'une case : est, sud, ouest, nord. */
const NEIGHBOURS = [[1, 0], [0, 1], [-1, 0], [0, -1]]

export interface Flood {
    width: number
    height: number
    /** Hauteur du sol au centre de chaque case (le lit, pour la rivière et le lac). */
    ground: Float32Array
    depth: Float32Array
    /** Quatre débits sortants par case, dans l'ordre de NEIGHBOURS. */
    flux: Float32Array
    solid: Uint8Array
    /** Cases de rivière et de lac : leur niveau est imposé. */
    river: Uint8Array
    /** 1 sur une case qui vient d'être noyée, puis décroît jusqu'à 0 en séchant. */
    mud: Float32Array
    /** Reste de temps pas encore simulé (moins d'un pas). */
    pending: number
}

export interface FloodLevels {
    /** Surface de la rivière et du lac. */
    river: number
    /** Niveau de la nappe : là où le sol est plus bas, l'eau sourd. */
    table: number
}

/** `solid` : cases que l'eau ne traverse pas (maisons, château). */
export function createFlood(map: WorldMap, terrain: Terrain, solid: (tile: Position) => boolean, levels: FloodLevels): Flood {
    const size = map.width * map.height
    const flood: Flood = {
        width: map.width, height: map.height,
        ground: new Float32Array(size), depth: new Float32Array(size), flux: new Float32Array(size * 4),
        solid: new Uint8Array(size), river: new Uint8Array(size), mud: new Float32Array(size), pending: 0,
    }
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
        const index = y * map.width + x
        const river = tileAt(map, {x, y}) === 'water'
        flood.river[index] = river ? 1 : 0
        flood.solid[index] = solid({x, y}) ? 1 : 0
        flood.ground[index] = river ? RIVER_LEVEL - BED_DEPTH : terrain.tile({x, y})
        flood.depth[index] = river ? Math.max(0, levels.river - flood.ground[index]) : 0
    }
    return flood
}

const indexOf = (flood: Flood, {x, y}: Position) => x < 0 || y < 0 || x >= flood.width || y >= flood.height ? -1 : y * flood.width + x

export function depthAt(flood: Flood, tile: Position) {
    const index = indexOf(flood, tile)
    return index < 0 ? 0 : flood.depth[index]
}

/** Case de terre sous plus de WADE d'eau : infranchissable à pied. */
export function isFlooded(flood: Flood, tile: Position) {
    const index = indexOf(flood, tile)
    return index >= 0 && !flood.river[index] && flood.depth[index] > WADE
}

/** Niveau de l'eau sur une case mouillée, sinon null. */
export function surfaceAt(flood: Flood, tile: Position) {
    const index = indexOf(flood, tile)
    return index >= 0 && flood.depth[index] > WET ? flood.ground[index] + flood.depth[index] : null
}

/** Avance la crue de `seconds` secondes réelles. */
export function stepFlood(flood: Flood, seconds: number, levels: FloodLevels) {
    flood.pending = Math.min(flood.pending + seconds, STEP * MAX_STEPS)
    while (flood.pending >= STEP) {
        flood.pending -= STEP
        flow(flood, levels)
    }
    for (let index = 0; index < flood.mud.length; index++) {
        if (flood.river[index]) continue
        flood.mud[index] = flood.depth[index] > WET ? 1 : Math.max(0, flood.mud[index] - seconds / MUD_SECONDS)
    }
}

function flow(flood: Flood, {river, table}: FloodLevels) {
    const {width, height, ground, depth, flux, solid} = flood
    // 1. Débits : chaque côté accélère selon la différence de niveau, puis tout est réduit si la case se viderait.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const index = y * width + x
        if (solid[index]) continue
        const level = ground[index] + depth[index]
        let total = 0
        for (let side = 0; side < 4; side++) {
            const nx = x + NEIGHBOURS[side][0], ny = y + NEIGHBOURS[side][1]
            const neighbour = ny * width + nx
            const open = nx >= 0 && ny >= 0 && nx < width && ny < height && !solid[neighbour]
            const value = open ? Math.max(0, flux[index * 4 + side] * DAMPING + STEP * GRAVITY * (level - ground[neighbour] - depth[neighbour])) : 0
            flux[index * 4 + side] = value
            total += value
        }
        if (total * STEP > depth[index]) {
            const scale = depth[index] / (total * STEP)
            for (let side = 0; side < 4; side++) flux[index * 4 + side] *= scale
        }
    }
    // 2. Hauteurs : ce qui entre moins ce qui sort ; puis les sources (rivière imposée, nappe) et le sol qui boit.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const index = y * width + x
        if (solid[index]) continue
        let change = 0
        for (let side = 0; side < 4; side++) {
            change -= flux[index * 4 + side]
            const nx = x - NEIGHBOURS[side][0], ny = y - NEIGHBOURS[side][1]
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) change += flux[(ny * width + nx) * 4 + side]
        }
        let water = depth[index] + change * STEP
        if (flood.river[index]) water = Math.max(0, river - ground[index])
        else {
            const below = table - ground[index] - water
            water += below > 0 ? below * SEEPAGE * STEP : -SOAK_IN * STEP
        }
        depth[index] = Math.max(0, water)
    }
}

/**
 * Hauteur de la surface à dessiner, par case : le niveau là où l'eau est, celui des voisines mouillées sur la
 * première case sèche (le sol coupe la surface juste au bord), et loin sous le sol ailleurs.
 */
export function surfaceHeights(flood: Flood, target: Float32Array) {
    const {width, height, ground, depth} = flood
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const index = y * width + x
        if (depth[index] > WET || flood.river[index]) {
            target[index] = ground[index] + depth[index]
            continue
        }
        let level = -Infinity
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const neighbour = ny * width + nx
            if (depth[neighbour] > WET || flood.river[neighbour]) level = Math.max(level, ground[neighbour] + depth[neighbour])
        }
        target[index] = level > -Infinity ? level : ground[index] + DRY
    }
    return target
}
