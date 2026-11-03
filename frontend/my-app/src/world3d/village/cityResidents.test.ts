import { describe, expect, it } from 'vitest'
import { canEnter, tileAt, WORLD_MAP } from '../../world/worldMap'
import { castleBlocks } from '../castle/castleArea'
import { CITY_VILLAGERS } from './cityResidents'
import { findPath } from './pathfinding'

describe('Habitants des rues de liaison', () => {
    it('habite les nouvelles maisons avec des métiers et des enfants, sans identifiants dupliqués', () => {
        expect(CITY_VILLAGERS).toHaveLength(45)
        expect(new Set(CITY_VILLAGERS.map((profile) => profile.id)).size).toBe(45)
        expect(new Set(CITY_VILLAGERS.map((profile) => profile.job)).size).toBeGreaterThan(10)
        expect(CITY_VILLAGERS.filter((profile) => profile.child)).toHaveLength(4)
    })

    it('garde les routines marchables et accessibles depuis chaque domicile sans traverser le château', () => {
        const passable = (position: {x: number; y: number}) => canEnter(tileAt(WORLD_MAP, position), 'walking') && !castleBlocks(position)
        for (const profile of CITY_VILLAGERS) {
            expect(passable(profile.home), profile.id).toBe(true)
            for (const shift of profile.schedule) for (const spot of shift.spots) {
                const path = findPath(profile.home, spot, passable)
                expect(path, `${profile.id} vers ${spot.x},${spot.y}`).not.toBeNull()
                expect(path!.length).toBeLessThan(30)
            }
        }
    })
})
