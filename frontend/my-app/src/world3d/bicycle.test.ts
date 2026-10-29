import { describe, expect, it } from 'vitest'
import { bankAngle, chainPath, COG, CHAINRING, crankTurn, GEAR, WHEEL_RADIUS } from './bicycle'

describe('Vélo', () => {
    it('fait un tour de pédalier pendant que la roue en fait près de trois', () => {
        expect(GEAR).toBeCloseTo(2.86, 2)
        expect(crankTurn(2 * Math.PI * WHEEL_RADIUS * GEAR)).toBeCloseTo(2 * Math.PI)
    })

    it('penche vers l’intérieur du virage, d’autant plus que l’on roule vite', () => {
        expect(bankAngle(9, 0)).toBeCloseTo(0)
        // Lacet positif : virage à gauche, donc roulis négatif (le haut du vélo part à gauche).
        expect(bankAngle(5, 0.8)).toBeLessThan(0)
        expect(bankAngle(0, -0.8)).toBeCloseTo(0)
        expect(bankAngle(5, -0.8)).toBeGreaterThan(0)
        expect(Math.abs(bankAngle(8, 0.8))).toBeGreaterThan(Math.abs(bankAngle(4, 0.8)))
        expect(Math.abs(bankAngle(100, 5))).toBeLessThanOrEqual(0.45)
    })

    it('garde la chaîne tendue : elle se referme sur elle-même et touche les deux dentures', () => {
        const cog = {z: -0.49, y: 0.31}, ring = {z: -0.06, y: 0.27}
        const path = chainPath(cog, COG, ring, CHAINRING)
        const start = path.at(0), loop = path.at(path.length)
        expect(loop.z).toBeCloseTo(start.z, 6)
        expect(loop.y).toBeCloseTo(start.y, 6)
        // Deux brins d'environ 43 cm et un demi-tour sur chaque denture.
        expect(path.length).toBeGreaterThan(2 * 0.42 + Math.PI * (COG + CHAINRING) * 0.9)
        expect(path.length).toBeLessThan(2 * 0.44 + Math.PI * (COG + CHAINRING) * 1.1)
        for (let step = 0; step < 200; step++) {
            const {z, y} = path.at((step / 200) * path.length)
            const fromCog = Math.hypot(z - cog.z, y - cog.y), fromRing = Math.hypot(z - ring.z, y - ring.y)
            // Aucun maillon ne rentre dans les dentures.
            expect(fromCog).toBeGreaterThanOrEqual(COG - 1e-6)
            expect(fromRing).toBeGreaterThanOrEqual(CHAINRING - 1e-6)
        }
    })

    it('fait avancer le brin du haut vers le plateau', () => {
        const path = chainPath({z: -0.49, y: 0.31}, COG, {z: -0.06, y: 0.27}, CHAINRING)
        // Le dernier segment est le brin du haut : du pignon vers le plateau.
        const end = path.at(path.length - 0.001), before = path.at(path.length - 0.1)
        expect(end.z).toBeGreaterThan(before.z)
        expect(end.y).toBeGreaterThan(0.31)
    })
})
