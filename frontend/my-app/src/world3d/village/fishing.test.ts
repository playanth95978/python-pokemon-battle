import { describe, expect, it } from 'vitest'
import type { FishingEvent, FishingState, FishingWorld, Point } from './fishing'
import { biteDelay, castDistance, castLine, createFishing, FISH, LINE_REACH, moveAngler, pickFish, updateFishing } from './fishing'

/** Hasard reproductible (mulberry32). */
function seeded(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0
        let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
}

/** Berge en z = 0, eau du lac au-delà de 2 m. */
const world = (seed = 1, overrides: Partial<FishingWorld> = {}): FishingWorld => ({
    waterAt: ({z}: Point) => z > 2 ? 'lake' : null, hour: 12, rain: 0, storm: false, random: seeded(seed), ...overrides,
})

const STEP = 1 / 30

/** Fait tourner la pêche jusqu'à `until` ; `input` décide de la touche à chaque pas. */
function run(state: FishingState, place: FishingWorld, until: (events: FishingEvent[]) => boolean,
             input: (state: FishingState) => { holding: boolean; pressed: boolean } = () => ({holding: false, pressed: false}), seconds = 120) {
    const all: FishingEvent[] = []
    for (let time = 0; time < seconds; time += STEP) {
        const {holding, pressed} = input(state)
        all.push(...updateFishing(state, STEP, holding, pressed, place))
        if (until(all)) break
    }
    return all
}

const types = (events: FishingEvent[]): string[] => events.map((event) => event.type)

/** Lance vers l'eau (appui sur F) et attend que le flotteur s'y pose. */
function castFar(state: FishingState, place: FishingWorld, distance = 9) {
    const events = castLine(state, {x: 0, z: 0}, {x: 0, z: 1}, distance)
    return [...events, ...run(state, place, (all) => types(all).includes('splash') || types(all).includes('missed'), undefined, 5)]
}

/** Pêcheur appliqué : ferre dès la touche, mouline tant que le fil le supporte, laisse filer sinon. */
const careful = (state: FishingState) => {
    if (state.phase === 'bite') return {holding: true, pressed: true}
    if (state.phase === 'fight') return {holding: state.tension < 0.75, pressed: false}
    return {holding: false, pressed: false}
}

describe('Pêche', () => {
    it('règle seul la portée du lancer un peu au-delà du bord de l’eau', () => {
        const waterAt = world().waterAt
        expect(castDistance({x: 0, z: 0}, {x: 0, z: 1}, waterAt)).toBe(4)
        expect(castDistance({x: 0, z: -4}, {x: 0, z: 1}, waterAt)).toBe(8)
        expect(castDistance({x: 0, z: 0}, {x: 1, z: 0}, waterAt)).toBeNull()
        const state = createFishing()
        expect(castFar(state, world(), 4)[0]).toEqual({type: 'cast', distance: 4})
        expect(state.phase).toBe('waiting')
        expect(state.float.z).toBeCloseTo(4)
    })

    it('ramène la ligne quand le flotteur retombe sur la berge', () => {
        const state = createFishing()
        expect(types(castFar(state, world(), 1.5))).toContain('missed')
        expect(state.phase).toBe('idle')
    })

    it('ignore un ferrage avant la touche', () => {
        const state = createFishing()
        castFar(state, world())
        const events = run(state, world(), () => true, () => ({holding: true, pressed: true}))
        expect(events).toEqual([])
        expect(state.phase).toBe('waiting')
    })

    it('laisse le flotteur en place quand le dresseur longe la berge, et ramène la ligne quand il s’en éloigne', () => {
        const state = createFishing()
        castFar(state, world())
        expect(moveAngler(state, {x: 3, z: 0})).toEqual([])
        expect(state.float).toEqual({x: 0, z: 9})
        expect(state.line).toBeCloseTo(Math.hypot(3, 9))
        expect(state.heading.x).toBeLessThan(0)
        expect(moveAngler(state, {x: 0, z: 9 - LINE_REACH - 1})).toEqual([{type: 'tooFar'}])
        expect(state.phase).toBe('idle')
    })

    it('laisse le poisson recracher l’appât si l’on ne ferre pas à temps, puis attend une autre touche', () => {
        const state = createFishing(), place = world(3)
        castFar(state, place)
        const events = run(state, place, (all) => types(all).includes('spat'))
        expect(types(events)).toContain('bite')
        expect(state.phase).toBe('waiting')
        expect(state.fish).toBeNull()
    })

    it('sort le poisson quand on ferre à la touche et qu’on ménage le fil', () => {
        const landed = [1, 2, 3, 4, 5, 6].map((seed) => {
            const state = createFishing(), place = world(seed)
            castFar(state, place)
            const events = run(state, place, (all) => ['landed', 'snap', 'unhooked'].some((type) => types(all).includes(type)), careful)
            return events.find((event) => event.type === 'landed')
        })
        expect(landed.filter(Boolean).length).toBeGreaterThanOrEqual(5)
        for (const event of landed) {
            if (event?.type !== 'landed') continue
            expect(event.weight).toBeGreaterThanOrEqual(event.fish.weight[0])
            expect(event.weight).toBeLessThanOrEqual(event.fish.weight[1])
        }
    })

    it('casse le fil quand on mouline sans relâcher contre un Poissirène', () => {
        const state = createFishing(), place = world(2)
        castFar(state, place)
        run(state, place, (all) => types(all).includes('bite'))
        state.fish = FISH.goldeen
        const events = run(state, place, (all) => ['landed', 'snap', 'unhooked'].some((type) => types(all).includes(type)),
            (current) => ({holding: true, pressed: current.phase === 'bite'}))
        expect(types(events)).toContain('snap')
    })

    it('perd le poisson quand on ne mouline jamais', () => {
        const state = createFishing(), place = world(4)
        castFar(state, place)
        run(state, place, (all) => types(all).includes('bite'))
        const events = run(state, place, (all) => ['landed', 'snap', 'unhooked'].some((type) => types(all).includes(type)),
            (current) => ({holding: false, pressed: current.phase === 'bite'}))
        expect(types(events)).not.toContain('landed')
        expect(state.phase).toBe('idle')
    })

    it('fait mordre plus vite à l’aube qu’à midi', () => {
        const average = (hour: number) => {
            const random = seeded(7)
            let total = 0
            for (let index = 0; index < 400; index++) total += biteDelay({hour, rain: 0, storm: false, random})
            return total / 400
        }
        expect(average(6)).toBeLessThan(average(12) * 0.8)
    })

    it('ne fait mordre Léviator qu’au lac, par orage', () => {
        const catches = (water: 'lake' | 'river', storm: boolean) => {
            const random = seeded(11)
            return new Set(Array.from({length: 600}, () => pickFish(water, {storm, random}).speciesKey))
        }
        expect(catches('lake', true)).toContain('gyarados')
        expect(catches('lake', false)).not.toContain('gyarados')
        expect(catches('river', true)).not.toContain('gyarados')
        expect(catches('river', false)).toContain('barboach')
    })
})
