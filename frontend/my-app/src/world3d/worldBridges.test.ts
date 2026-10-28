import { describe, expect, it } from 'vitest'
import type { WorldMap } from '../world/types'
import { bridgeSections } from './worldBridges'

describe('Ponts des quartiers de Clairbois', () => {
  it('sépare les traversées et conserve les cases contiguës dans le même pont', () => {
    const map: WorldMap = {width: 10, height: 4, tileSize: 32,
      tiles: Array.from({length: 40}, (_, index) => [1, 2, 11, 12, 8, 18].includes(index) ? 'bridge' : 'grass'),
      buildings: [], landmarks: [], props: [],
    }
    expect(bridgeSections(map)).toEqual([
      [{x: 1, y: 0}, {x: 2, y: 0}, {x: 1, y: 1}, {x: 2, y: 1}],
      [{x: 8, y: 0}, {x: 8, y: 1}],
    ])
  })
})
