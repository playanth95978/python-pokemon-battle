import { describe, expect, it } from 'vitest'
import type { Direction, Position } from './types'
import {
  BOAT_DOCK,
  cameraPosition,
  nearbyLandmark,
  nextPosition,
  tileAt,
  WORLD_MAP,
  WORLD_SPAWN,
  zoneAt
} from './worldMap'

describe('Carte de Clairbois', () => {
    it('bloque arbres, maisons, eau et limites, mais autorise le pont', () => {
        expect(WORLD_MAP.tiles).toHaveLength(20_480)
        expect(tileAt(WORLD_MAP, WORLD_SPAWN)).toBe('path')
        expect(nextPosition(WORLD_MAP, {x: 2, y: 34}, 'left')).toEqual({x: 2, y: 34})
        expect(nextPosition(WORLD_MAP, {x: 11, y: 32}, 'up')).toEqual({x: 11, y: 32})
        expect(nextPosition(WORLD_MAP, {x: 41, y: 30}, 'right')).toEqual({x: 41, y: 30})
        expect(nextPosition(WORLD_MAP, {x: 41, y: 34}, 'right')).toEqual({x: 42, y: 34})
        expect(nextPosition(WORLD_MAP, {x: 0, y: 34}, 'left')).toEqual({x: 0, y: 34})
    })

    it('permet de rejoindre les quatre lieux et chaque panneau depuis le départ', () => {
        // Une carte jolie mais coupée par une rivière infranchissable ne serait pas jouable.
        const queue: Position[] = [WORLD_SPAWN], seen = new Set([`${WORLD_SPAWN.x},${WORLD_SPAWN.y}`])
        const directions: Direction[] = ['up', 'down', 'left', 'right']
        for (let index = 0; index < queue.length; index++) for (const direction of directions) {
            const next = nextPosition(WORLD_MAP, queue[index], direction), key = `${next.x},${next.y}`
            if (!seen.has(key)) {
                seen.add(key);
                queue.push(next)
            }
        }
        expect(new Set(queue.map(zoneAt)).size).toBe(4)
        for (const landmark of WORLD_MAP.landmarks) expect(seen.has(`${landmark.x},${landmark.y}`), landmark.name).toBe(true)
        expect(nearbyLandmark(WORLD_MAP, WORLD_SPAWN)?.name).toBe('Panneau de Clairbois')
    })

    it('garde la caméra dans la carte, y compris près des bords', () => {
        expect(cameraPosition(WORLD_MAP, {x: 0, y: 0}, 800, 560)).toEqual({x: 0, y: 0})
        expect(cameraPosition(WORLD_MAP, {x: 159, y: 127}, 800, 560)).toEqual({x: 4320, y: 3536})
        expect(cameraPosition(WORLD_MAP, WORLD_SPAWN, 6000, 6000)).toEqual({x: 0, y: 0})
    })
    it('autorise l’eau en bateau mais interdit de monter sur la rive', () => {
        expect(
            nextPosition(WORLD_MAP, BOAT_DOCK.shore, 'right', 'walking'),
        ).toEqual(BOAT_DOCK.shore)

        expect(
            nextPosition(WORLD_MAP, BOAT_DOCK.water, 'right', 'boat'),
        ).toEqual({x: 43, y: 38})

        expect(
            nextPosition(WORLD_MAP, BOAT_DOCK.water, 'left', 'boat'),
        ).toEqual(BOAT_DOCK.water)
    })
})
