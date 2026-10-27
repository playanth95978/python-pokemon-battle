import { describe, expect, it } from 'vitest'
import { minimapOffset, playerHeading } from './minimapProjection'

describe('Repères du radar', () => {
    it('garde le joueur au centre, même après déplacement ou rotation de caméra', () => {
        expect(minimapOffset({x: 5021, y: 4988}, {x: 5021, y: 4988}, 1.2, 2)).toEqual({x: 0, y: 0})
    })
    it('place le nord en haut et l’est à droite lorsque la caméra regarde vers le nord', () => {
        const player = {x: 5000, y: 5000}
        expect(minimapOffset({x: 5000, y: 4990}, player, 0, 1)).toEqual({x: 0, y: -10})
        expect(minimapOffset({x: 5010, y: 5000}, player, 0, 1)).toEqual({x: 10, y: 0})
    })
    it('fait tourner terrain et direction ensemble lorsque la caméra passe à l’est du joueur', () => {
        const point = minimapOffset({x: 5010, y: 5000}, {x: 5000, y: 5000}, Math.PI / 2, 1)
        expect(point.x).toBeCloseTo(0)
        expect(point.y).toBeCloseTo(10)
        expect(playerHeading('right', Math.PI / 2)).toBeCloseTo(Math.PI)
        expect(playerHeading('up', Math.PI / 2)).toBeCloseTo(Math.PI / 2)
    })
})
