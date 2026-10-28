import { describe, expect, it } from 'vitest'
import { nextPosition, tileAt, WORLD_MAP } from '../world/worldMap'
import { EXIT, isExitGap, leadsToOpenWorld, nearExit } from './worldExit'

describe('Sortie de Clairbois 3D vers le monde ouvert', () => {
  it('se trouve au bout de la route est, juste avant la bordure d’arbres', () => {
    for (let y = EXIT.minY; y <= EXIT.maxY; y++) {
      expect(tileAt(WORLD_MAP, {x: EXIT.x, y})).toBe('path')
      expect(tileAt(WORLD_MAP, {x: EXIT.x + 1, y})).toBe('tree')
    }
  })

  it('est atteignable à pied depuis le départ en suivant la route vers l’est', () => {
    let position = {x: 18, y: 34}
    for (let step = 0; step < WORLD_MAP.width; step++) position = nextPosition(WORLD_MAP, position, 'right')
    expect(position).toEqual({x: EXIT.x, y: 34})
    expect(leadsToOpenWorld(position, 'right')).toBe(true)
  })

  it('ne se déclenche qu’en poussant vers l’est depuis le bout de la route', () => {
    expect(leadsToOpenWorld({x: EXIT.x, y: 34}, 'up')).toBe(false)
    expect(leadsToOpenWorld({x: EXIT.x - 1, y: 34}, 'right')).toBe(false)
    expect(leadsToOpenWorld({x: EXIT.x, y: EXIT.maxY + 1}, 'right')).toBe(false)
  })

  it('prévient à l’approche et ouvre une trouée dans les arbres derrière la sortie', () => {
    expect(nearExit({x: EXIT.x - 2, y: 33})).toBe(true)
    expect(nearExit({x: 30, y: 34})).toBe(false)
    expect(isExitGap({x: WORLD_MAP.width - 1, y: 34})).toBe(true)
    expect(isExitGap({x: WORLD_MAP.width - 1, y: 20})).toBe(false)
    expect(nearExit({x: 61, y: 34})).toBe(false)
  })
})
