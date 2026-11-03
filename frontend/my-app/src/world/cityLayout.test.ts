import { describe, expect, it } from 'vitest'
import { buildingEntrance, createHouse } from './buildings'
import { CITY_STREETS, cityStreetAt } from './cityLayout'
import { canEnter, tileAt, WORLD_MAP, WORLD_SPAWN, zoneAt } from './worldMap'
import { castleBlocks } from '../world3d/castle/castleArea'
import type { Position } from './types'

describe('Rues habitées de Clairbois', () => {
  it('oriente les parcelles et les portes vers les quatre côtés sans déformer les modèles', () => {
    for (const [facing, size, entrance] of [
      ['down', [5, 6], {x: 12, y: 26}], ['up', [5, 6], {x: 12, y: 19}],
      ['left', [6, 5], {x: 9, y: 22}], ['right', [6, 5], {x: 16, y: 22}],
    ] as const) {
      const house = createHouse(10, 20, 'fantasy_house_a', 'Test', '#aabbcc', facing)
      expect([house.width, house.height]).toEqual(size)
      expect(buildingEntrance(house)).toEqual(entrance)
    }
  })

  it('double la densité bâtie, avec des rues nommées et des ambiances distinctes', () => {
    const additions = WORLD_MAP.buildings.filter((building) => building.district)
    expect(additions).toHaveLength(45)
    expect(new Set(additions.map((building) => building.facing)).size).toBe(4)
    expect(new Set(additions.map((building) => building.facade)).size).toBeGreaterThanOrEqual(8)
    expect(new Set(additions.map((building) => building.district)).size).toBe(7)
    for (const street of CITY_STREETS) {
      expect(WORLD_MAP.landmarks.some((point) => point.name === street.name), street.name).toBe(true)
    }
    expect(new Set(additions.map((building) => building.name)).size).toBe(additions.length)
  })

  it('dégage les arbres des rues et rattache les nouvelles voies au village', () => {
    for (const position of [{x: 56, y: 34}, {x: 51, y: 95}, {x: 148, y: 70}]) {
      expect(cityStreetAt(position)).toBeDefined()
      expect(zoneAt(position)).toBe('Clairbois')
    }
    for (let y = 29; y <= 39; y++) {
      expect(tileAt(WORLD_MAP, {x: 56, y})).not.toBe('tree')
    }
    expect(cityStreetAt({x: 156, y: 60})).toBeUndefined()
  })

  it('ne superpose ni maisons, ni mobilier, ni château et relie chaque nouvelle entrée à une rue', () => {
    const occupied = new Set<string>()
    for (const building of WORLD_MAP.buildings) {
      for (let y = building.y; y < building.y + building.height; y++) for (let x = building.x; x < building.x + building.width; x++) {
        const key = `${x},${y}`
        expect(occupied.has(key), `${building.name} chevauche une autre maison en ${key}`).toBe(false)
        expect(castleBlocks({x, y})).toBe(false)
        occupied.add(key)
      }
      if (!building.district) continue
      const entrance = buildingEntrance(building)
      expect(tileAt(WORLD_MAP, entrance), building.name).toBe('path')
    }
    for (const prop of WORLD_MAP.props) expect(occupied.has(`${prop.x},${prop.y}`), prop.kind).toBe(false)
  })

  it('conserve un itinéraire de rue depuis le départ jusqu’aux commerces, quais et jardins', () => {
    const queue: Position[] = [WORLD_SPAWN], seen = new Set([`${WORLD_SPAWN.x},${WORLD_SPAWN.y}`])
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = {x: current.x + dx, y: current.y + dy}, key = `${next.x},${next.y}`
        if (seen.has(key) || !['path', 'bridge'].includes(tileAt(WORLD_MAP, next) ?? '') || castleBlocks(next)) continue
        seen.add(key); queue.push(next)
      }
    }
    for (const building of WORLD_MAP.buildings.filter((building) => building.district)) {
      const entrance = buildingEntrance(building)
      expect(seen.has(`${entrance.x},${entrance.y}`), building.name).toBe(true)
      expect(canEnter(tileAt(WORLD_MAP, entrance), 'walking')).toBe(true)
    }
  })
})
