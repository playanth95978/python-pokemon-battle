import { describe, expect, it } from 'vitest'
import { buildTerrainData, lodFor, TERRAIN_CHUNK } from './terrainGeometry'
import { createWorldGenerator } from './worldGenerator'

describe('Maillage des chunks de terrain', () => {
  const world = createWorldGenerator(42)

  it('réduit le détail avec la distance', () => {
    expect([0, 1, 2, 3, 6, 7, 10].map(lodFor)).toEqual([0, 0, 1, 1, 2, 3, 3])
  })

  it('divise par deux le nombre de segments à chaque niveau, jupes comprises', () => {
    for (const lod of [0, 1, 2, 3]) {
      const segments = TERRAIN_CHUNK >> lod
      const data = buildTerrainData(world, 156, 156, lod)
      expect(data.positions.length / 3).toBe((segments + 1) ** 2 + segments * 4)
      expect(data.indices.length).toBe(segments * segments * 6 + segments * 4 * 6)
    }
  })

  it('raccorde exactement deux chunks voisins sur leur bord commun', () => {
    const west = buildTerrainData(world, 156, 156, 0), east = buildTerrainData(world, 157, 156, 0)
    const size = TERRAIN_CHUNK + 1
    for (let j = 0; j < size; j++) {
      const left = (j * size + TERRAIN_CHUNK) * 3, right = j * size * 3
      expect(Array.from(east.positions.subarray(right, right + 3))).toEqual(Array.from(west.positions.subarray(left, left + 3)))
    }
  })

  it('produit des normales unitaires tournées vers le ciel', () => {
    const {normals} = buildTerrainData(world, 156, 156, 1)
    for (let index = 0; index < (TERRAIN_CHUNK / 2 + 1) ** 2; index++) {
      const [x, y, z] = normals.subarray(index * 3, index * 3 + 3)
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5)
      expect(y).toBeGreaterThan(0)
    }
  })
})
