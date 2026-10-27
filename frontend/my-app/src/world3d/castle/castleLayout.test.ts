import { describe, expect, it } from 'vitest'
import type { Direction } from '../../world/types'
import type { CastleState } from './castleLayout'
import { BOSS, DOORS, enterCastle, ITEMS, moveInCastle, nearBoss, roomAt, ROOMS, STAIRS, tileAt } from './castleLayout'

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right']
const KEYS = new Set(ITEMS.filter((item) => item.kind === 'key').map((item) => item.id))
// Seules les clés et les portes ouvertes changent les chemins possibles : les autres objets n'entrent pas dans l'état.
const id = (state: CastleState) =>
  `${state.floor}:${state.x}:${state.z}:${state.inventory.filter((item) => KEYS.has(item)).sort().join(',')}:${[...state.opened].sort().join(',')}`

/** Exploration exhaustive : chaque état (case, clés, portes ouvertes) n'est visité qu'une fois. */
function explore() {
  const start = enterCastle()
  const seen = new Map([[id(start), start]])
  const queue = [start]
  while (queue.length) {
    const state = queue.shift()!
    for (const direction of DIRECTIONS) {
      const {state: next} = moveInCastle(state, direction)
      if (!seen.has(id(next))) {
        seen.set(id(next), next)
        queue.push(next)
      }
    }
  }
  return [...seen.values()]
}
const states = explore()

describe('Plan du château de Clairbois', () => {
  it('compte dix pièces sur trois étages, sans chevauchement', () => {
    expect(ROOMS).toHaveLength(10)
    expect(new Set(ROOMS.map((room) => room.floor))).toEqual(new Set([0, 1, 2]))
    for (const room of ROOMS) {
      for (let z = room.z; z < room.z + room.depth; z++) {
        for (let x = room.x; x < room.x + room.width; x++) expect(roomAt({floor: room.floor, x, z})?.id).toBe(room.id)
      }
    }
  })

  it('pose chaque objet, porte et escalier sur une case libre du plan', () => {
    for (const item of ITEMS) expect(tileAt(item)).toBe('floor')
    for (const door of DOORS) expect(tileAt(door)).toBe('door')
    for (const stairs of STAIRS) {
      expect(tileAt(stairs)).toBe('stairs')
      expect(tileAt(stairs.to)).toBe('floor')
      // Chaque escalier a son retour, juste à côté de la case d'arrivée.
      expect(STAIRS.some((back) => back.floor === stairs.to.floor && back.to.floor === stairs.floor)).toBe(true)
    }
  })

  it('laisse visiter les dix pièces et ramasser tous les objets en trouvant les clés dans l’ordre', () => {
    const visited = new Set(states.map((state) => roomAt(state)?.id))
    expect([...ROOMS.map((room) => room.id)].every((room) => visited.has(room))).toBe(true)
    for (const item of ITEMS) {
      expect(states.some((state) => state.floor === item.floor && state.x === item.x && state.z === item.z)).toBe(true)
    }
    expect(states.some((state) => nearBoss(state))).toBe(true)
  })

  it('garde la salle du trésor et la salle du trône fermées sans leurs clés', () => {
    for (const state of states) {
      if (roomAt(state)?.id === 'treasury') expect(state.inventory).toContain('silver-key')
      if (roomAt(state)?.id === 'throne') expect(state.inventory).toContain('gold-key')
    }
  })

  it('ouvre une porte avec sa clé puis la franchit, et ramasse l’objet de la case d’arrivée', () => {
    const door = DOORS.find((candidate) => candidate.id === 'gallery-treasury')!
    const before: CastleState = {floor: 1, x: 17, z: 7, facing: 'down', inventory: [], opened: []}
    expect(moveInCastle(before, 'down').event.type).toBe('locked')
    const withKey = {...before, inventory: ['silver-key']}
    const unlocked = moveInCastle(withKey, 'down')
    expect(unlocked.event).toEqual({type: 'unlocked', door})
    expect(unlocked.state.z).toBe(7)
    expect(moveInCastle(unlocked.state, 'down').state.z).toBe(8)
    const elixir = ITEMS.find((item) => item.id === 'elixir')!
    const pickup = moveInCastle({...unlocked.state, x: elixir.x, z: elixir.z - 1}, 'down')
    expect(pickup.event).toEqual({type: 'pickup', item: elixir})
    expect(moveInCastle({...pickup.state, z: elixir.z - 1}, 'down').event.type).toBe('moved')
  })

  it('fait sortir par la grande porte et met Mewtwo à portée seulement de près', () => {
    expect(moveInCastle(enterCastle(), 'left').event.type).toBe('exit')
    const near: CastleState = {floor: BOSS.floor, x: BOSS.x, z: BOSS.z + 2, facing: 'up', inventory: [], opened: []}
    expect(nearBoss(near)).toBe(true)
    expect(nearBoss({...near, z: BOSS.z + 4})).toBe(false)
  })
})
