import { describe, expect, it } from 'vitest'
import type { Direction } from '../../world/types'
import type { CastleState } from './castleLayout'
import { ALTAR, BOSS, DOORS, enterCastle, interact, ITEMS, moveInCastle, nearBoss, roomAt, ROOMS, STAIRS, tileAt } from './castleLayout'

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
    // Les quatre pas, plus E (passage secret, autel) là où il fait quelque chose.
    const nexts = [...DIRECTIONS.map((direction) => moveInCastle(state, direction).state), interact(state)?.state]
    for (const next of nexts) {
      if (next && !seen.has(id(next))) {
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
    // La Potion Max est cachée dans l'épaisseur du passage secret ; la Clé d'or est remise par l'autel.
    for (const item of ITEMS.filter((candidate) => !candidate.reward)) {
      const secret = DOORS.some((door) => door.secret && door.floor === item.floor && door.x === item.x && door.z === item.z)
      expect(tileAt(item)).toBe(secret ? 'door' : 'floor')
    }
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
    for (const item of ITEMS) expect(states.some((state) => state.inventory.includes(item.id))).toBe(true)
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

  it('garde les objets ramassés et les portes ouvertes quand on revient dans le château', () => {
    const back = enterCastle({inventory: ['silver-key'], opened: ['gallery-treasury']})
    expect(back).toMatchObject({floor: 0, inventory: ['silver-key'], opened: ['gallery-treasury']})
    expect(moveInCastle({...back, floor: 1, x: 17, z: 7}, 'down').event.type).toBe('moved')
  })

  it('ouvre le passage secret seulement en poussant le mur creux, et y cache la Potion Max', () => {
    const library: CastleState = {floor: 0, x: 12, z: 6, facing: 'left', inventory: [], opened: []}
    expect(moveInCastle(library, 'left').event.type).toBe('hollow')
    expect(interact({...library, x: 14})).toBeNull()
    const pushed = interact(library)!
    expect(pushed.event.type).toBe('secret')
    const through = moveInCastle(pushed.state, 'left')
    expect(through.event).toMatchObject({type: 'pickup', item: {id: 'max-potion'}})
    expect(moveInCastle(through.state, 'left').state).toMatchObject({x: 10, z: 6})
  })

  it('échange la Pierre Lune contre la Clé d’or à l’autel de la chapelle, une seule fois', () => {
    const facingAltar: CastleState = {floor: ALTAR.floor, x: ALTAR.x + 1, z: ALTAR.z + 1, facing: 'up', inventory: [], opened: []}
    expect(interact(facingAltar)?.event.type).toBe('altar')
    const solved = interact({...facingAltar, inventory: ['moon-stone']})!
    expect(solved.event).toMatchObject({type: 'riddle', item: {id: 'gold-key'}})
    expect(solved.state.inventory).toEqual(['moon-stone', 'gold-key'])
    expect(interact(solved.state)?.event.type).toBe('altar')
  })
})
