/**
 * Relief de Clairbois : le bourg sur un plateau à hauteur 0, une vallée qui descend vers la rivière et le lac,
 * et des cuvettes (champs, enclos, pré d'Évoli) où l'eau s'accumule quand la nappe monte. Les maisons, la place et
 * le château restent sur le plat. Module pur : la simulation de crue et les tests s'en servent sans three.js.
 */
import type { Position, WorldMap } from '../world/types'
import { tileAt } from '../world/worldMap'
import { CASTLE_AREA } from './castle/castleArea'

/** Surface de la rivière et du lac par temps sec ; la berge est dix centimètres au-dessus. */
export const RIVER_LEVEL = -0.55
const BANK = -0.45
/** Distance à l'eau (en cases) où la vallée rejoint le plateau. */
const VALLEY_WIDTH = 9
/** Profondeur du lit sous la surface, au plus loin des rives. */
export const BED_DEPTH = 0.43

interface Rect { x: number; y: number; width: number; height: number }

/** Cuvettes : terre labourée des champs, fond de l'enclos, creux du pré au nord. */
const BASINS: (Rect & { depth: number })[] = [
    {x: 9, y: 45, width: 7, height: 5, depth: 0.3},
    {x: 3, y: 51, width: 5, height: 4, depth: 0.28},
    {x: 10, y: 20, width: 6, height: 4, depth: 0.25},
]
/** Pente des cuvettes et talus autour des constructions, en cases. */
const BASIN_SLOPE = 2.5, PAD_SLOPE = 1

export interface Terrain {
    /** Hauteur du sol en un point du monde (x vers l'est, z vers le sud, une case = une unité). */
    height(x: number, z: number): number
    /** Hauteur au centre d'une case. */
    tile(position: Position): number
}

const smoothstep = (edge0: number, edge1: number, value: number) => {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
}

function distanceToRect(x: number, z: number, rect: Rect) {
    const dx = Math.max(rect.x - x, 0, x - rect.x - rect.width), dz = Math.max(rect.y - z, 0, z - rect.y - rect.height)
    return Math.hypot(dx, dz)
}

/** Distance euclidienne exacte à l'eau, en deux passes linéaires sur les coins de la grille. */
function waterDistances(map: WorldMap) {
    const columns = map.width + 1, rows = map.height + 1
    const distances = new Float64Array(columns * rows).fill(Infinity)
    // Aux coordonnées entières, le point le plus proche d'une case d'eau est un de ses quatre coins.
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
        if (tileAt(map, {x, y}) !== 'water') continue
        for (const dy of [0, 1]) for (const dx of [0, 1]) distances[(y + dy) * columns + x + dx] = 0
    }
    const size = Math.max(columns, rows)
    const input = new Float64Array(size), output = new Float64Array(size)
    const sites = new Int32Array(size), breaks = new Float64Array(size + 1)
    const transform = (length: number) => {
        let last = -1
        for (let q = 0; q < length; q++) {
            if (!Number.isFinite(input[q])) continue
            let crossing = -Infinity
            while (last >= 0) {
                const p = sites[last]
                crossing = ((input[q] + q * q) - (input[p] + p * p)) / (2 * (q - p))
                if (crossing > breaks[last]) break
                last--
            }
            sites[++last] = q
            breaks[last] = last === 0 ? -Infinity : crossing
            breaks[last + 1] = Infinity
        }
        if (last < 0) {
            output.fill(Infinity, 0, length)
            return
        }
        let site = 0
        for (let q = 0; q < length; q++) {
            while (breaks[site + 1] < q) site++
            const offset = q - sites[site]
            output[q] = offset * offset + input[sites[site]]
        }
    }
    for (let y = 0; y < rows; y++) {
        input.set(distances.subarray(y * columns, (y + 1) * columns))
        transform(columns)
        distances.set(output.subarray(0, columns), y * columns)
    }
    for (let x = 0; x < columns; x++) {
        for (let y = 0; y < rows; y++) input[y] = distances[y * columns + x]
        transform(rows)
        for (let y = 0; y < rows; y++) distances[y * columns + x] = Math.sqrt(output[y])
    }
    return new Float32Array(distances)
}

export function createTerrain(map: WorldMap): Terrain {
    // Distance à l'eau la plus proche, aux coins des cases ; interpolée entre eux.
    const corners = map.width + 1, distances = waterDistances(map)
    const distance = (x: number, z: number) => {
        const cx = Math.min(Math.max(x, 0), map.width), cz = Math.min(Math.max(z, 0), map.height)
        const x0 = Math.min(Math.floor(cx), map.width - 1), z0 = Math.min(Math.floor(cz), map.height - 1)
        const fx = cx - x0, fz = cz - z0
        const at = (dx: number, dz: number) => distances[(z0 + dz) * corners + x0 + dx]
        // Carte sans eau : éviter Infinity × 0 aux points situés exactement sur la grille.
        if (!Number.isFinite(at(0, 0))) return Infinity
        return (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fz) + (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fz
    }
    // Plates-formes : maisons et château, avec une case de marge pour la cour.
    const pads: Rect[] = [
        ...map.buildings.map(({x, y, width, height}) => ({x: x - 0.5, y: y - 0.5, width: width + 1, height: height + 1})),
        {x: CASTLE_AREA.x - 1, y: CASTLE_AREA.y - 1, width: CASTLE_AREA.width + 2, height: CASTLE_AREA.depth + 2},
    ]
    // Seules les plateformes à moins d'une case influencent le relief ; les maisons lointaines sont ignorées.
    const padBuckets = new Map<string, Rect[]>()
    const bucketSize = 8
    for (const pad of pads) {
        for (let bz = Math.floor((pad.y - PAD_SLOPE) / bucketSize); bz <= Math.floor((pad.y + pad.height + PAD_SLOPE) / bucketSize); bz++) {
            for (let bx = Math.floor((pad.x - PAD_SLOPE) / bucketSize); bx <= Math.floor((pad.x + pad.width + PAD_SLOPE) / bucketSize); bx++) {
                const key = `${bx},${bz}`
                const bucket = padBuckets.get(key) ?? []
                bucket.push(pad)
                padBuckets.set(key, bucket)
            }
        }
    }
    const height = (x: number, z: number) => {
        let value = BANK * (1 - smoothstep(1, VALLEY_WIDTH, distance(x, z)))
        for (const basin of BASINS) value -= basin.depth * (1 - smoothstep(0, BASIN_SLOPE, distanceToRect(x, z, basin)))
        for (const pad of padBuckets.get(`${Math.floor(x / bucketSize)},${Math.floor(z / bucketSize)}`) ?? []) {
            value *= smoothstep(0, PAD_SLOPE, distanceToRect(x, z, pad))
        }
        return value
    }
    return {height, tile: ({x, y}) => height(x + 0.5, y + 0.5)}
}
