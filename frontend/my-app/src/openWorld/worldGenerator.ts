/** Monde ouvert de 10 000 × 10 000 cases, calculé à la demande à partir d'une graine (rien n'est stocké). */
import { createNoise2D, fbm, ridged } from './noise'

export const WORLD_SIZE = 10_000
export const SEA_LEVEL = 0
/** Dénivelé maximal franchissable à pied entre deux cases voisines. */
export const MAX_STEP_HEIGHT = 1.6

export type Biome =
    | 'deep_water' | 'shallow_water' | 'river' | 'beach' | 'plains' | 'forest'
    | 'swamp' | 'desert' | 'tundra' | 'mountain' | 'snow'

export const BIOME_NAMES: Record<Biome, string> = {
    deep_water: 'Haute mer', shallow_water: 'Eaux peu profondes', river: 'Rivière', beach: 'Plage',
    plains: 'Plaine', forest: 'Forêt', swamp: 'Marais', desert: 'Désert', tundra: 'Toundra',
    mountain: 'Montagne', snow: 'Sommets enneigés',
}

export interface WorldSample {
    /** Altitude en unités du monde (1 case = 1 unité), 0 = niveau de la mer. */
    height: number
    /** Humidité et température relatives, environ dans [-1, 1]. */
    moisture: number
    temperature: number
    biome: Biome
}

export interface WorldGenerator {
    seed: number
    sample: (x: number, y: number) => WorldSample
    height: (x: number, y: number) => number
    canWalk: (from: { x: number; y: number }, to: { x: number; y: number }) => boolean
    /** `isFree` exclut en plus les cases occupées (arbres, rochers…). */
    findSpawn: (isFree?: (tile: { x: number; y: number }) => boolean) => { x: number; y: number }
}

function smoothstep(edge0: number, edge1: number, value: number) {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
}

function mix(a: number, b: number, t: number) {
    return a + (b - a) * t
}

export function createWorldGenerator(seed: number): WorldGenerator {
    // Un bruit indépendant par phénomène : continents, collines, montagnes, rivières, climat.
    const [continents, hills, ranges, peaks, rivers, heat, rain] = Array.from({length: 7}, (_, index) => createNoise2D(seed * 7919 + index))

    /** Relief brut et intensité de rivière, sans le climat (utilisé aussi pour la marche). */
    function terrain(x: number, y: number) {
        const edge = Math.max(Math.abs(x / WORLD_SIZE - 0.5), Math.abs(y / WORLD_SIZE - 0.5)) * 2
        // > 0 : terre ferme. Les bords du monde plongent dans l'océan pour fermer la carte.
        const land = fbm(continents, x / 2600, y / 2600, 5) * 1.7 + 0.4 - smoothstep(0.75, 0.97, edge) * 1.8
        if (land < 0) return {height: Math.max(-24, land * 34), river: 0, land}
        const coast = smoothstep(0, 0.2, land)
        const rolling = fbm(hills, x / 320, y / 320, 4) * 4.5 * smoothstep(0, 0.12, land)
        const mountainMask = smoothstep(0.12, 0.45, fbm(ranges, x / 1700, y / 1700, 3) + land * 0.25)
        const mountains = mountainMask * ridged(peaks, x / 540, y / 540, 5) * 95 * coast
        let height = land * 16 + rolling + mountains + 0.6
        // Rivières de basse et moyenne altitude : un sillon creusé jusque sous le niveau de la mer.
        const channel = Math.abs(fbm(rivers, x / 1150, y / 1150, 3))
        const strength = (1 - smoothstep(16, 34, height)) * smoothstep(0.02, 0.1, land)
        const river = (1 - smoothstep(0.006, 0.02, channel)) * strength
        height = mix(height, Math.min(height, -1.8), river)
        return {height, river, land}
    }

    function sample(x: number, y: number): WorldSample {
        const {height, river, land} = terrain(x, y)
        // Plus chaud au sud, plus froid en altitude ; plus humide près des rivières.
        const temperature = fbm(heat, x / 2300, y / 2300, 3) * 0.7 + (y / WORLD_SIZE - 0.5) * 0.9 - Math.max(0, height) / 85
        const moisture = fbm(rain, x / 1600, y / 1600, 4) * 1.3 + river * 0.4
        return {height, moisture, temperature, biome: biomeOf(height, river, land, temperature, moisture)}
    }

    function height(x: number, y: number) {
        return terrain(x, y).height
    }

    function canWalk(from: { x: number; y: number }, to: { x: number; y: number }) {
        if (to.x < 0 || to.y < 0 || to.x >= WORLD_SIZE || to.y >= WORLD_SIZE) return false
        const target = height(to.x + 0.5, to.y + 0.5)
        return target >= SEA_LEVEL && Math.abs(target - height(from.x + 0.5, from.y + 0.5)) <= MAX_STEP_HEIGHT
    }

    /** Première plaine tempérée et plate, en spirale autour du centre du monde. */
    function findSpawn(isFree: (tile: { x: number; y: number }) => boolean = () => true) {
        const center = WORLD_SIZE / 2
        for (let radius = 0; radius < WORLD_SIZE / 2; radius += 7) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.max(0.05, 7 / Math.max(1, radius))) {
                const x = Math.round(center + Math.cos(angle) * radius), y = Math.round(center + Math.sin(angle) * radius)
                const here = sample(x + 0.5, y + 0.5)
                if (here.biome !== 'plains' || here.temperature < -0.1 || here.temperature > 0.15 || !isFree({x, y})) continue
                const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({x: x + dx, y: y + dy}))
                if (neighbours.every((neighbour) => canWalk({x, y}, neighbour) && isFree(neighbour))) return {x, y}
            }
        }
        return {x: center, y: center}
    }

    return {seed, sample, height, canWalk, findSpawn}
}

function biomeOf(height: number, river: number, land: number, temperature: number, moisture: number): Biome {
    if (height < SEA_LEVEL) {
        if (river > 0.5 && land > 0) return 'river'
        return height < -6 ? 'deep_water' : 'shallow_water'
    }
    if (height > 62 || (height > 42 && temperature < -0.3)) return 'snow'
    if (height > 30) return 'mountain'
    if (height < 1.6 && land < 0.08) return temperature < -0.45 ? 'tundra' : 'beach'
    if (temperature < -0.45) return 'tundra'
    if (temperature > 0.2 && moisture < 0.1) return 'desert'
    if (moisture > 0.32 && height < 9) return 'swamp'
    if (moisture > 0.02) return 'forest'
    return 'plains'
}
