import { describe, expect, it } from 'vitest'
import type { PlayerState } from './types'
import { BOAT_DOCK, boatActionAtDock, nextPosition, toggleBoatAtDock, WORLD_MAP } from './worldMap'

function playerAtDock(): PlayerState {
  return { position: { ...BOAT_DOCK.shore }, travelMode: 'walking', direction: 'down', steps: 29,
    visited: ['Clairbois', 'Prairie des lucioles'] }
}

describe('Bateau de Clairbois', () => {
  it('embarque et débarque au ponton en conservant les découvertes et les pas', () => {
    const walking = playerAtDock()
    expect(boatActionAtDock(walking)).toBe('board')
    const sailing = toggleBoatAtDock(WORLD_MAP, walking)
    expect(sailing).toEqual({ ...walking, position: BOAT_DOCK.water, travelMode: 'boat', direction: 'right' })
    expect(walking.position).toEqual(BOAT_DOCK.shore)
    expect(boatActionAtDock(sailing)).toBe('disembark')
    expect(toggleBoatAtDock(WORLD_MAP, sailing)).toEqual({ ...walking, direction: 'left' })
  })

  it('refuse de changer de mode loin de l’embarcadère, même près d’une autre rive', () => {
    const walking = { ...playerAtDock(), position: { x: 41, y: 39 } }
    const sailing: PlayerState = { ...walking, travelMode: 'boat', position: { x: 43, y: 38 } }
    expect(boatActionAtDock(walking)).toBeNull()
    expect(boatActionAtDock(sailing)).toBeNull()
    expect(toggleBoatAtDock(WORLD_MAP, walking)).toBe(walking)
    expect(toggleBoatAtDock(WORLD_MAP, sailing)).toBe(sailing)
  })

  it('ne fait pas apparaître le joueur sur une case invalide si la carte change', () => {
    const tiles = [...WORLD_MAP.tiles]
    tiles[BOAT_DOCK.water.y * WORLD_MAP.width + BOAT_DOCK.water.x] = 'wall'
    const walking = playerAtDock()
    expect(toggleBoatAtDock({ ...WORLD_MAP, tiles }, walking)).toBe(walking)
  })

  it('navigue vers le lac mais bloque les rives et le pont', () => {
    const sailing = toggleBoatAtDock(WORLD_MAP, playerAtDock())
    expect(nextPosition(WORLD_MAP, sailing.position, 'right', 'boat')).toEqual({ x: 43, y: 38 })
    expect(nextPosition(WORLD_MAP, sailing.position, 'left', 'boat')).toEqual(sailing.position)
    expect(nextPosition(WORLD_MAP, { x: 42, y: 36 }, 'up', 'boat')).toEqual({ x: 42, y: 36 })
    expect(nextPosition(WORLD_MAP, { x: 42, y: 42 }, 'down', 'boat')).toEqual({ x: 42, y: 43 })
  })
})
