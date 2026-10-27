import { describe, expect, it } from 'vitest'
import { WORLD_MAP } from '../world/worldMap'
import { CHUNK_SIZE, chunkOf, chunksAround, chunkTiles, isOutside, LOAD_RADIUS, UNLOAD_RADIUS } from './worldChunks'

describe('Découpage du monde 3D en chunks', () => {
  it('range chaque case dans le chunk qui la contient', () => {
    expect(chunkOf({ x: 0, y: 0 })).toEqual({ cx: 0, cy: 0 })
    expect(chunkOf({ x: CHUNK_SIZE - 1, y: CHUNK_SIZE })).toEqual({ cx: 0, cy: 1 })
  })

  it('charge d’abord le chunk du joueur puis ses voisins, sans sortir de la carte', () => {
    const chunks = chunksAround(WORLD_MAP, { x: 0, y: 0 }, 1)
    expect(chunks[0]).toEqual({ cx: 0, cy: 0 })
    expect(chunks).toHaveLength(4)
    expect(chunks.every(({ cx, cy }) => cx >= 0 && cy >= 0)).toBe(true)
  })

  it('couvre toute la carte une seule fois avec les cases des chunks', () => {
    const tiles = chunksAround(WORLD_MAP, { x: 32, y: 32 }, 99).flatMap((chunk) => chunkTiles(WORLD_MAP, chunk))
    expect(tiles).toHaveLength(WORLD_MAP.width * WORLD_MAP.height)
    expect(new Set(tiles.map(({ x, y }) => `${x},${y}`)).size).toBe(tiles.length)
  })

  it('garde un chunk chargé entre le rayon de chargement et celui de déchargement', () => {
    const player = { x: 4, y: 4 }
    const edge = { cx: LOAD_RADIUS + 1, cy: 0 }
    expect(chunksAround(WORLD_MAP, player)).not.toContainEqual(edge)
    expect(isOutside(edge, player, UNLOAD_RADIUS)).toBe(false)
    expect(isOutside({ cx: UNLOAD_RADIUS + 1, cy: 0 }, player, UNLOAD_RADIUS)).toBe(true)
  })
})
