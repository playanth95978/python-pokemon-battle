import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../world/types'
import { tileAt, WORLD_MAP, WORLD_SPAWN } from '../world/worldMap'
import { loadGame, SAVE_KEY, SAVE_VERSION, saveGame } from './saveGame'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

const player: PlayerState = {travelMode: 'walking', position: {...WORLD_SPAWN}, direction: 'left', steps: 12, visited: ['Clairbois']}

describe('Sauvegarde de Clairbois 3D', () => {
  it('reprend la position, le sac et les portes ouvertes tels qu’ils ont été sauvegardés', () => {
    const storage = memoryStorage()
    const game = {player, castle: {floor: 1, x: 15, z: 5, facing: 'up' as const}, inventory: ['potion', 'silver-key'], opened: ['gallery-treasury']}
    saveGame(storage, game)
    expect(loadGame(storage)).toEqual({version: SAVE_VERSION, ...game})
  })

  it('démarre une nouvelle partie sans sauvegarde, avec une sauvegarde illisible ou d’une autre version', () => {
    const storage = memoryStorage()
    expect(loadGame(storage)).toBeNull()
    storage.setItem(SAVE_KEY, '{pas du json')
    expect(loadGame(storage)).toBeNull()
    storage.setItem(SAVE_KEY, JSON.stringify({version: SAVE_VERSION + 1, player, castle: null, inventory: [], opened: []}))
    expect(loadGame(storage)).toBeNull()
  })

  it('ignore une sauvegarde dont la case n’est plus praticable', () => {
    const storage = memoryStorage()
    const tree = WORLD_MAP.tiles.indexOf('tree')
    const blocked = {x: tree % WORLD_MAP.width, y: Math.floor(tree / WORLD_MAP.width)}
    expect(tileAt(WORLD_MAP, blocked)).toBe('tree')
    saveGame(storage, {player: {...player, position: blocked}, castle: null, inventory: [], opened: []})
    expect(loadGame(storage)).toBeNull()
    saveGame(storage, {player, castle: {floor: 0, x: 0, z: 0, facing: 'up'}, inventory: [], opened: []})
    expect(loadGame(storage)).toBeNull()
  })

  it('retire du sac les objets qui n’existent plus dans le château', () => {
    const storage = memoryStorage()
    saveGame(storage, {player, castle: null, inventory: ['potion', 'objet-retire'], opened: []})
    expect(loadGame(storage)?.inventory).toEqual(['potion'])
  })

  it('laisse la partie continuer quand le navigateur refuse d’écrire', () => {
    const full = {setItem: () => { throw new DOMException('quota', 'QuotaExceededError') }}
    expect(() => saveGame(full, {player, castle: null, inventory: [], opened: []})).not.toThrow()
  })
})
