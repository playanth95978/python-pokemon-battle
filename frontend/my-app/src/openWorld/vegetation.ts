/** Végétation et rochers placés case par case selon le biome, sans rien stocker : la même graine redonne la même forêt. */
import type { Biome, WorldGenerator, WorldSample } from './worldGenerator'
import { TERRAIN_CHUNK } from './terrainGeometry'

export type Species = 'oak' | 'pine' | 'snowPine' | 'willow' | 'palm' | 'cactus' | 'bush' | 'deadBush' | 'reed' | 'rock'
export const SPECIES: readonly Species[] = ['oak', 'pine', 'snowPine', 'willow', 'palm', 'cactus', 'bush', 'deadBush', 'reed', 'rock']
/** Espèces encore affichées en version simplifiée au loin ; les petites plantes ne le sont que de près. */
export const FAR_SPECIES: readonly Species[] = ['oak', 'pine', 'snowPine', 'willow', 'palm', 'cactus']
/** Espèces qui bloquent le passage du dresseur. */
const BLOCKING = new Set<Species>(['oak', 'pine', 'snowPine', 'willow', 'palm', 'cactus', 'rock'])

/** Probabilité de chaque espèce sur une case, selon le biome et le climat. */
function candidates(here: WorldSample): [Species, number][] {
    const cold = here.temperature < -0.15
    const table: Partial<Record<Biome, [Species, number][]>> = {
        forest: cold ? [['pine', 0.22], ['bush', 0.03]] : [['oak', 0.18], ['pine', 0.04], ['bush', 0.05]],
        plains: [['oak', 0.012], ['bush', 0.03], ['rock', 0.005]],
        swamp: [['willow', 0.07], ['reed', 0.14]],
        desert: [['cactus', 0.012], ['deadBush', 0.02], ['rock', 0.008]],
        beach: here.temperature > 0.05 ? [['palm', 0.015]] : [['rock', 0.01]],
        tundra: [['pine', 0.025], ['rock', 0.02], ['deadBush', 0.02]],
        mountain: here.height < 45 ? [['pine', 0.02], ['rock', 0.05]] : [['rock', 0.06]],
        snow: [['snowPine', 0.008], ['rock', 0.02]],
    }
    return table[here.biome] ?? []
}

function hash(x: number, y: number, seed: number) {
    let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
    value = Math.imul(value ^ (value >>> 13), 1274126177)
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}

export interface Plant {
    species: Species
    /** Position dans la case (0..1) : les plantes ne sont pas alignées sur la grille. */
    offsetX: number
    offsetY: number
    scale: number
    rotation: number
    /** Variation de teinte, environ 0.85..1.15. */
    tint: number
}

/** Plante occupant la case (x, y), ou null. Calculé à la demande, identique dans le worker et le fil principal. */
export function plantAt(world: WorldGenerator, x: number, y: number, here = world.sample(x + 0.5, y + 0.5)): Plant | null {
    if (here.height < 0.3) return null
    let roll = hash(x, y, world.seed)
    for (const [species, chance] of candidates(here)) {
        if (roll < chance) {
            return {
                species,
                offsetX: 0.25 + hash(x, y, world.seed + 1) * 0.5,
                offsetY: 0.25 + hash(x, y, world.seed + 2) * 0.5,
                scale: 0.75 + hash(x, y, world.seed + 3) * 0.6,
                rotation: hash(x, y, world.seed + 4) * Math.PI * 2,
                tint: 0.85 + hash(x, y, world.seed + 5) * 0.3,
            }
        }
        roll -= chance
    }
    return null
}

export function blocksMovement(plant: Plant | null) {
    return plant !== null && BLOCKING.has(plant.species)
}

// --- Données d'instances pour le rendu, calculées dans le worker ---

export interface SpeciesInstances {
    species: Species
    /** Matrices 4×4 en colonnes, prêtes pour InstancedMesh.instanceMatrix. */
    matrices: Float32Array
    /** Teinte RVB par instance. */
    colors: Float32Array
}

/** Matrice rotation Y + échelle + translation, en colonnes (format three.js). */
export function writeMatrix(target: Float32Array, offset: number, x: number, y: number, z: number, rotation: number, scale: number) {
    const cos = Math.cos(rotation) * scale, sin = Math.sin(rotation) * scale
    target.set([cos, 0, -sin, 0, 0, scale, 0, 0, sin, 0, cos, 0, x, y, z, 1], offset)
}

/** Niveau de détail à partir duquel seuls les arbres restent, en version simplifiée. */
export const FAR_LEVEL = 2

/**
 * Instances de végétation d'un chunk. Niveaux 0 (arbres réalistes) et 1 (low-poly) : toutes les espèces ;
 * niveau `FAR_LEVEL` : seulement les arbres, pour leur version simplifiée lointaine.
 */
export function buildVegetationData(world: WorldGenerator, cx: number, cy: number, level: number): SpeciesInstances[] {
    const kept = level < FAR_LEVEL ? SPECIES : FAR_SPECIES
    const found = new Map<Species, { position: number[]; plant: Plant }[]>()
    for (let y = cy * TERRAIN_CHUNK; y < (cy + 1) * TERRAIN_CHUNK; y++) {
        for (let x = cx * TERRAIN_CHUNK; x < (cx + 1) * TERRAIN_CHUNK; x++) {
            const plant = plantAt(world, x, y)
            if (!plant || !kept.includes(plant.species)) continue
            const px = x + plant.offsetX, pz = y + plant.offsetY
            // Légèrement enfoncé : pas de racines flottantes sur les pentes.
            const list = found.get(plant.species) ?? []
            list.push({position: [px, world.height(px, pz) - 0.1, pz], plant})
            found.set(plant.species, list)
        }
    }
    return [...found].map(([species, plants]) => {
        const matrices = new Float32Array(plants.length * 16), colors = new Float32Array(plants.length * 3)
        plants.forEach(({position: [x, y, z], plant}, index) => {
            writeMatrix(matrices, index * 16, x, y, z, plant.rotation, plant.scale)
            colors.set([plant.tint, plant.tint, plant.tint * 0.95], index * 3)
        })
        return {species, matrices, colors}
    })
}

// --- Herbe haute, seulement autour du joueur ---

const GRASS_DENSITY: Partial<Record<Biome, number>> = {plains: 9, forest: 4, swamp: 6, tundra: 3}
const GRASS_COLORS: Partial<Record<Biome, [number, number, number]>> = {
    plains: [0.32, 0.55, 0.18], forest: [0.2, 0.42, 0.14], swamp: [0.3, 0.4, 0.17], tundra: [0.5, 0.52, 0.34],
}

export function buildGrassData(world: WorldGenerator, cx: number, cy: number): Omit<SpeciesInstances, 'species'> {
    const matrices: number[] = [], colors: number[] = []
    const matrix = new Float32Array(16)
    for (let y = cy * TERRAIN_CHUNK; y < (cy + 1) * TERRAIN_CHUNK; y++) {
        for (let x = cx * TERRAIN_CHUNK; x < (cx + 1) * TERRAIN_CHUNK; x++) {
            const here = world.sample(x + 0.5, y + 0.5)
            const count = GRASS_DENSITY[here.biome] ?? 0
            if (!count || here.height < 0.2) continue
            const color = GRASS_COLORS[here.biome]!
            for (let index = 0; index < count; index++) {
                const px = x + hash(x, y, index * 31 + 7), pz = y + hash(x, y, index * 31 + 8)
                const shade = 0.75 + hash(x, y, index * 31 + 9) * 0.5
                // Hauteur prise au centre de la case : 1 échantillon par case au lieu d'un par brin.
                writeMatrix(matrix, 0, px, here.height - 0.02, pz, hash(x, y, index * 31 + 10) * 6.3, 0.6 + hash(x, y, index * 31 + 11) * 0.8)
                matrices.push(...matrix)
                colors.push(color[0] * shade, color[1] * shade, color[2] * shade)
            }
        }
    }
    return {matrices: new Float32Array(matrices), colors: new Float32Array(colors)}
}
