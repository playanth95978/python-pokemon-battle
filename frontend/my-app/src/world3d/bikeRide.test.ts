import { describe, expect, it } from 'vitest'
import type { BikeInput, BikeState } from './bikeRide'
import { createRide, MAX_SPEED, REVERSE_SPEED, updateRide } from './bikeRide'

const STEP = 1 / 60
const open = () => true

function ride(state: BikeState, input: Partial<BikeInput>, seconds: number, passable: (x: number, z: number) => boolean = open) {
    const events: string[] = []
    for (let time = 0; time < seconds; time += STEP) {
        const event = updateRide(state, STEP, {pedal: false, brake: false, turn: 0, ...input}, passable)
        if (event) events.push(event)
    }
    return events
}

describe('Conduite à vélo', () => {
    it('accélère en pédalant jusqu’à sa vitesse de croisière, sans la dépasser', () => {
        const state = createRide(0, 0, 0)
        ride(state, {pedal: true}, 1)
        const afterOneSecond = state.speed
        expect(afterOneSecond).toBeGreaterThan(2)
        ride(state, {pedal: true}, 20)
        expect(state.speed).toBeGreaterThan(afterOneSecond)
        expect(state.speed).toBeLessThanOrEqual(MAX_SPEED)
        // Cap 0 : vers le sud, tout droit.
        expect(state.x).toBeCloseTo(0)
        expect(state.z).toBeGreaterThan(100)
    })

    it('roule en roue libre puis s’arrête seul, mais freine bien plus court', () => {
        const coasting = createRide(0, 0, 0), braking = createRide(0, 0, 0)
        for (const state of [coasting, braking]) ride(state, {pedal: true}, 4)
        const start = coasting.z
        ride(coasting, {}, 60)
        ride(braking, {brake: true}, 2)
        expect(coasting.speed).toBe(0)
        expect(braking.speed).toBeLessThanOrEqual(0)
        expect(coasting.z - start).toBeGreaterThan(5 * (braking.z - start))
    })

    it('recule au pas quand on freine à l’arrêt', () => {
        const state = createRide(0, 0, 0)
        ride(state, {brake: true}, 3)
        expect(state.speed).toBeCloseTo(-REVERSE_SPEED)
        expect(state.z).toBeLessThan(0)
    })

    it('tourne en arc de cercle, plus large quand on va vite', () => {
        const radius = (pedalFor: number) => {
            const state = createRide(0, 0, 0)
            ride(state, {pedal: true}, pedalFor)
            ride(state, {pedal: true, turn: 1}, 1)
            return Math.abs(state.speed / state.yawRate)
        }
        const slow = radius(0.6), fast = radius(6)
        expect(slow).toBeGreaterThan(1)
        expect(fast).toBeGreaterThan(slow * 2)
    })

    it('tourne à gauche du cycliste avec la touche gauche', () => {
        const state = createRide(0, 0, 0)
        ride(state, {pedal: true, turn: 1}, 1)
        // Cap vers le sud : la gauche du cycliste est l'est.
        expect(state.heading).toBeGreaterThan(0)
        expect(state.x).toBeGreaterThan(0)
    })

    it('longe un mur pris de biais et bute contre un mur pris de face', () => {
        const wallEast = (x: number) => x < 2
        const sliding = createRide(0, 0, Math.PI / 4)
        expect(ride(sliding, {pedal: true}, 3, wallEast)).toEqual([])
        expect(sliding.x).toBeLessThan(2)
        expect(sliding.z).toBeGreaterThan(3)
        expect(sliding.speed).toBeGreaterThan(0)

        const facing = createRide(0, 0, Math.PI / 2)
        expect(ride(facing, {pedal: true}, 3, wallEast)).toContain('bump')
        expect(facing.x).toBeLessThan(2)
    })
})
