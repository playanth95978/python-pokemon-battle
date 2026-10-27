/** Maillage d'un chunk de terrain, calculé hors du fil principal (Web Worker) puis transféré sans copie. */
import type { Biome, WorldGenerator } from './worldGenerator'

export const TERRAIN_CHUNK = 32
/** Profondeur des « jupes » sous les bords : elles masquent les fentes entre chunks de détail différent. */
const SKIRT_DEPTH = 4

export interface TerrainData {
    positions: Float32Array
    normals: Float32Array
    colors: Float32Array
    /** Par sommet : part de sol sec, de roche et de neige, pour choisir la texture de détail. */
    surfaces: Float32Array
    indices: Uint32Array
}

/** Niveau de détail selon la distance en chunks : 32, 16, 8 puis 4 segments par côté. */
export function lodFor(distance: number) {
    if (distance <= 1) return 0
    if (distance <= 3) return 1
    if (distance <= 6) return 2
    return 3
}

const BIOME_COLORS: Record<Biome, [number, number, number]> = {
    deep_water: [0.12, 0.16, 0.14], shallow_water: [0.42, 0.38, 0.27], river: [0.35, 0.32, 0.24],
    beach: [0.86, 0.78, 0.55], plains: [0.42, 0.6, 0.27], forest: [0.2, 0.38, 0.16], swamp: [0.26, 0.33, 0.2],
    desert: [0.88, 0.72, 0.45], tundra: [0.5, 0.55, 0.45], mountain: [0.47, 0.44, 0.4], snow: [0.95, 0.96, 0.98],
}
const ROCK: [number, number, number] = [0.42, 0.39, 0.36]
const DRY: Partial<Record<Biome, number>> = {desert: 1, beach: 1, shallow_water: 1, river: 1, deep_water: 1, tundra: 0.5}

function hash(x: number, y: number) {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    return value - Math.floor(value)
}

/** Couleurs en espace linéaire (comme les attend three.js), à partir de valeurs sRGB. */
function linear(channel: number) {
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function buildTerrainData(world: WorldGenerator, cx: number, cy: number, lod: number): TerrainData {
    const segments = TERRAIN_CHUNK >> lod, step = TERRAIN_CHUNK / segments
    const size = segments + 1
    // Grille avec une rangée de bord en plus : normales continues d'un chunk à l'autre.
    const grid = size + 2
    const heights = new Float32Array(grid * grid)
    const originX = cx * TERRAIN_CHUNK + 0.5, originY = cy * TERRAIN_CHUNK + 0.5
    for (let j = 0; j < grid; j++) {
        for (let i = 0; i < grid; i++) heights[j * grid + i] = world.height(originX + (i - 1) * step, originY + (j - 1) * step)
    }
    const skirt = segments * 4
    const vertexCount = size * size + skirt
    const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), colors = new Float32Array(vertexCount * 3)
    const surfaces = new Float32Array(vertexCount * 3)
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const vertex = j * size + i, x = originX + i * step, y = originY + j * step
            const h = heights[(j + 1) * grid + i + 1]
            positions.set([x, h, y], vertex * 3)
            const dx = heights[(j + 1) * grid + i + 2] - heights[(j + 1) * grid + i]
            const dy = heights[(j + 2) * grid + i + 1] - heights[j * grid + i + 1]
            const nx = -dx, ny = 2 * step, nz = -dy, length = Math.hypot(nx, ny, nz)
            normals.set([nx / length, ny / length, nz / length], vertex * 3)
            const sample = world.sample(x, y)
            // Les pentes raides deviennent de la roche, quelle que soit la région.
            const rock = Math.min(1, Math.max(0, (1 - ny / length - 0.25) * 4))
            const base = sample.biome === 'snow' && rock > 0.6 ? ROCK : BIOME_COLORS[sample.biome]
            const grain = 0.9 + hash(Math.round(x), Math.round(y)) * 0.2
            colors.set(base.map((channel, index) => linear((channel + (ROCK[index] - channel) * rock) * grain)), vertex * 3)
            const stone = sample.biome === 'mountain' ? Math.max(rock, 0.7) : rock
            surfaces.set([DRY[sample.biome] ?? 0, stone, sample.biome === 'snow' && rock < 0.6 ? 1 : 0], vertex * 3)
        }
    }
    // Jupes : copie abaissée de chaque sommet du contour.
    const border: number[] = []
    for (let i = 0; i < segments; i++) border.push(i)
    for (let j = 0; j < segments; j++) border.push(j * size + segments)
    for (let i = segments; i > 0; i--) border.push(segments * size + i)
    for (let j = segments; j > 0; j--) border.push(j * size)
    border.forEach((source, index) => {
        const vertex = size * size + index
        positions.set([positions[source * 3], positions[source * 3 + 1] - SKIRT_DEPTH, positions[source * 3 + 2]], vertex * 3)
        normals.set(normals.subarray(source * 3, source * 3 + 3), vertex * 3)
        colors.set(colors.subarray(source * 3, source * 3 + 3), vertex * 3)
        surfaces.set(surfaces.subarray(source * 3, source * 3 + 3), vertex * 3)
    })
    const indices = new Uint32Array(segments * segments * 6 + skirt * 6)
    let cursor = 0
    for (let j = 0; j < segments; j++) {
        for (let i = 0; i < segments; i++) {
            const a = j * size + i, b = a + 1, c = a + size, d = c + 1
            indices.set([a, c, b, b, c, d], cursor)
            cursor += 6
        }
    }
    border.forEach((top, index) => {
        const nextTop = border[(index + 1) % border.length]
        const bottom = size * size + index, nextBottom = size * size + (index + 1) % border.length
        // Le contour tourne dans le sens horaire vu du dessus : triangles orientés vers l'extérieur.
        indices.set([top, nextTop, bottom, nextTop, nextBottom, bottom], cursor)
        cursor += 6
    })
    return {positions, normals, colors, surfaces, indices}
}
