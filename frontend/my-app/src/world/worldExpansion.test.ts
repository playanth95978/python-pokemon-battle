import { describe, expect, it } from 'vitest'
import type { Position } from './types'
import { BOAT_DOCK, canEnter, CLAIRBOIS_DISTRICTS, nextPosition, tileAt, WORLD_MAP, WORLD_SPAWN } from './worldMap'

function reachableFromSpawn() {
  const queue: Position[] = [WORLD_SPAWN]
  const seen = new Set([`${WORLD_SPAWN.x},${WORLD_SPAWN.y}`])
  for (let index = 0; index < queue.length; index++) {
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      const next = nextPosition(WORLD_MAP, queue[index], direction), key = `${next.x},${next.y}`
      if (!seen.has(key)) {
        seen.add(key)
        queue.push(next)
      }
    }
  }
  return seen
}

describe('Agrandissement de Clairbois', () => {
  it('multiplie la surface par cinq avec quatre quartiers habités supplémentaires', () => {
    expect(WORLD_MAP.width).toBe(160)
    expect(WORLD_MAP.height).toBe(128)
    expect(WORLD_MAP.tiles).toHaveLength(5 * 64 * 64)
    expect(WORLD_MAP.buildings).toHaveLength(35)
    expect(CLAIRBOIS_DISTRICTS).toHaveLength(4)
    for (const district of CLAIRBOIS_DISTRICTS) {
      expect(WORLD_MAP.buildings.filter(({name}) => (district.houses as readonly string[]).includes(name))).toHaveLength(7)
      expect(WORLD_MAP.landmarks.some(({name}) => name === district.name)).toBe(true)
    }
    expect(new Set(WORLD_MAP.props.map(({kind}) => kind))).toEqual(new Set([
      'fountain', 'stall', 'bench', 'crates', 'barrels', 'lantern', 'well', 'anvil', 'hay', 'cart', 'crops', 'fence',
    ]))
  })

  it('conserve les accès historiques au départ, au bateau, au pont et au château', () => {
    expect(WORLD_SPAWN).toEqual({x: 18, y: 36})
    expect(tileAt(WORLD_MAP, WORLD_SPAWN)).toBe('path')
    expect(tileAt(WORLD_MAP, BOAT_DOCK.shore)).toBe('grass')
    expect(tileAt(WORLD_MAP, BOAT_DOCK.water)).toBe('water')
    expect(tileAt(WORLD_MAP, {x: 42, y: 34})).toBe('bridge')
    expect(tileAt(WORLD_MAP, {x: 22, y: 50})).toBe('grass')
    expect(WORLD_MAP.buildings[0]).toEqual({x: 10, y: 26, width: 5, height: 6, name: 'Maison du départ', roof: '#c86c4d', model: 'fantasy_house_a'})
  })

  it('relie les places et toutes les portes au vieux bourg sans traverser un bâtiment', () => {
    const seen = reachableFromSpawn()
    for (const district of CLAIRBOIS_DISTRICTS) {
      expect(seen.has(`${district.x},${district.y}`), district.name).toBe(true)
    }
    for (const building of WORLD_MAP.buildings) {
      const door = {x: building.x + Math.floor(building.width / 2), y: building.y + building.height}
      expect(seen.has(`${door.x},${door.y}`), building.name).toBe(true)
    }
    expect(seen.has('157,34')).toBe(true)
    expect(tileAt(WORLD_MAP, {x: 43, y: 88})).toBe('bridge')
    expect(tileAt(WORLD_MAP, {x: 111, y: 34})).toBe('bridge')
  })

  it('garde les nouvelles pâtures et les postes de vie accessibles sans collision de mobilier', () => {
    const seen = reachableFromSpawn()
    const posts = [[-3, -2], [-1, -2], [1, -2], [3, -2], [-3, 2], [-1, 2], [1, 2], [-3, 4], [-1, 4], [1, 4], [3, 4]]
    for (const district of CLAIRBOIS_DISTRICTS) {
      for (const [dx, dy] of posts) for (const shift of [0, 1]) {
        expect(seen.has(`${district.x + dx},${district.y + dy + shift}`), `${district.name} : ${dx},${dy + shift}`).toBe(true)
      }
      for (let dy = district.farm + 1; dy < district.farm + 5; dy++) for (let dx = 14; dx < 19; dx++) {
        expect(canEnter(tileAt(WORLD_MAP, {x: district.x + dx, y: district.y + dy}), 'walking')).toBe(true)
      }
      for (let dy = district.farm + 1; dy < district.farm + 6; dy++) for (let dx = -13; dx < -6; dx++) {
        expect(canEnter(tileAt(WORLD_MAP, {x: district.x + dx, y: district.y + dy}), 'walking')).toBe(true)
      }
    }
  })

  it('ferme les bords de la grande carte et ne place aucun bâtiment hors terrain', () => {
    for (let x = 0; x < WORLD_MAP.width; x++) for (const y of [0, WORLD_MAP.height - 1]) {
      expect(tileAt(WORLD_MAP, {x, y})).toBe('tree')
    }
    for (let y = 0; y < WORLD_MAP.height; y++) for (const x of [0, WORLD_MAP.width - 1]) {
      expect(tileAt(WORLD_MAP, {x, y})).toBe('tree')
    }
    for (const building of WORLD_MAP.buildings) {
      expect(building.x).toBeGreaterThanOrEqual(2)
      expect(building.y).toBeGreaterThanOrEqual(2)
      expect(building.x + building.width).toBeLessThan(WORLD_MAP.width - 1)
      expect(building.y + building.height).toBeLessThan(WORLD_MAP.height - 1)
    }
  })
})
