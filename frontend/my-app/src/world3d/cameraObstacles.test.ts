import { describe, expect, it } from 'vitest'
import { WORLD_MAP } from '../world/worldMap'
import { createCameraObstacles } from './cameraObstacles'

const reach = createCameraObstacles(WORLD_MAP)

describe('Caméra dehors', () => {
    it('garde tout son recul en terrain dégagé', () => {
        expect(reach({x: 18.5, y: 0, z: 36.5}, {x: 0, y: 4.2, z: 7})).toBe(1)
    })

    it('s’arrête devant la Maison du départ quand le dresseur lui tourne le dos', () => {
        // Dresseur devant la porte (12, 32), caméra reculée vers le nord, donc dans la maison (10..14, 26..31).
        const allowed = reach({x: 12.5, y: 0, z: 32.5}, {x: 0, y: 4.2, z: -7})
        expect(allowed).toBeLessThan(0.15)
        expect(32.5 - 7 * allowed).toBeGreaterThan(32)
    })

    it('garde tout son recul au bord de l’eau, sous le niveau du bourg', () => {
        expect(reach({x: 39.5, y: -0.45, z: 42.5}, {x: 0, y: 4.2, z: -7})).toBe(1)
    })

    it('ne bouge pas pour un bâtiment que le regard survole de haut', () => {
        expect(reach({x: 12.5, y: 0, z: 34.5}, {x: 0, y: 30, z: -4})).toBe(1)
    })
})
