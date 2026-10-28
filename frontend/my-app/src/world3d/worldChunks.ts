/** Découpage de la carte en chunks chargés et libérés autour du joueur. */
import type { Position, WorldMap } from '../world/types'

export const CHUNK_SIZE = 8
/** Chunks construits autour du joueur (distance de Tchebychev, en chunks). */
export const LOAD_RADIUS = 6
/** Rayon de déchargement des chunks de décor. */
export const UNLOAD_RADIUS = 7
/** Le décor est entièrement masqué avant la limite garantie des chunks, avec une marge de quatre cases. */
export const VIEW_DISTANCE = LOAD_RADIUS * CHUNK_SIZE - 4
/** Les brins d'herbe, coûteux et invisibles de loin, restent proches du joueur. */
export const GRASS_RADIUS = 1
export const GRASS_UNLOAD_RADIUS = 2

export interface ChunkKey { cx: number; cy: number }

export function chunkId({ cx, cy }: ChunkKey) {
  return `${cx},${cy}`
}

export function chunkOf(position: Position): ChunkKey {
  return { cx: Math.floor(position.x / CHUNK_SIZE), cy: Math.floor(position.y / CHUNK_SIZE) }
}

export function chunkDistance(a: ChunkKey, b: ChunkKey) {
  return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy))
}

/** Chunks de la carte à moins de `radius` du joueur, les plus proches d'abord. */
export function chunksAround(map: WorldMap, position: Position, radius = LOAD_RADIUS): ChunkKey[] {
  const center = chunkOf(position)
  const columns = Math.ceil(map.width / CHUNK_SIZE), rows = Math.ceil(map.height / CHUNK_SIZE)
  const chunks: ChunkKey[] = []
  for (let cy = Math.max(0, center.cy - radius); cy <= Math.min(rows - 1, center.cy + radius); cy++) {
    for (let cx = Math.max(0, center.cx - radius); cx <= Math.min(columns - 1, center.cx + radius); cx++) chunks.push({ cx, cy })
  }
  return chunks.sort((a, b) => chunkDistance(a, center) - chunkDistance(b, center)
    || Math.hypot(a.cx - center.cx, a.cy - center.cy) - Math.hypot(b.cx - center.cx, b.cy - center.cy))
}

/** Un chunk chargé n'est libéré qu'au-delà de son rayon de déchargement (hystérésis). */
export function isOutside(chunk: ChunkKey, position: Position, radius: number) {
  return chunkDistance(chunk, chunkOf(position)) > radius
}

/** Cases (x, y) couvertes par un chunk, bornées à la carte. */
export function chunkTiles(map: WorldMap, { cx, cy }: ChunkKey): Position[] {
  const tiles: Position[] = []
  for (let y = cy * CHUNK_SIZE; y < Math.min(map.height, (cy + 1) * CHUNK_SIZE); y++) {
    for (let x = cx * CHUNK_SIZE; x < Math.min(map.width, (cx + 1) * CHUNK_SIZE); x++) tiles.push({ x, y })
  }
  return tiles
}
