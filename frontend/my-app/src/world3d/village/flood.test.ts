import { describe, expect, it } from 'vitest'
import type { Position } from '../../world/types'
import { tileAt, WORLD_MAP } from '../../world/worldMap'
import { castleBlocks } from '../castle/castleArea'
import { createTerrain, RIVER_LEVEL } from '../terrain'
import type { Flood, FloodLevels } from './flood'
import { createFlood, depthAt, isFlooded, stepFlood, WET } from './flood'
import { createWeather, floodLevels, startRain, updateWeather } from './weather'

const terrain = createTerrain(WORLD_MAP)
const solid = (tile: Position) => castleBlocks(tile) || WORLD_MAP.buildings.some((building) => tile.x >= building.x && tile.x < building.x + building.width
    && tile.y >= building.y && tile.y < building.y + building.height)
const DRY: FloodLevels = floodLevels(createWeather())
const PEAK: FloodLevels = floodLevels({rain: 1, left: 0, storm: true, soak: 1, rise: 1})

/** Simule `seconds` secondes réelles par pas d'image (60 images par seconde). */
function run(flood: Flood, seconds: number, levels: FloodLevels) {
    for (let time = 0; time < seconds; time += 1 / 60) stepFlood(flood, 1 / 60, levels)
}

const landWet = (flood: Flood) => {
    const wet: string[] = []
    for (let y = 0; y < WORLD_MAP.height; y++) for (let x = 0; x < WORLD_MAP.width; x++) {
        if (tileAt(WORLD_MAP, {x, y}) !== 'water' && depthAt(flood, {x, y}) > WET) wet.push(`${x},${y}`)
    }
    return wet
}

describe('Relief de Clairbois', () => {
    it('garde le bourg à plat et creuse une vallée jusqu’aux berges, au-dessus de l’eau', () => {
        expect(terrain.tile({x: 23, y: 40})).toBeCloseTo(0)
        expect(terrain.tile({x: 18, y: 36})).toBeCloseTo(0)
        expect(terrain.tile({x: 28, y: 50})).toBeCloseTo(0)
        expect(terrain.tile({x: 39, y: 30})).toBeLessThan(-0.3)
        expect(terrain.tile({x: 41, y: 30})).toBeGreaterThan(RIVER_LEVEL)
        expect(terrain.tile({x: 12, y: 47})).toBeLessThan(-0.25)
    })
})

describe('Crue de Clairbois', () => {
    it('laisse la terre sèche par beau temps', () => {
        const flood = createFlood(WORLD_MAP, terrain, solid, DRY)
        run(flood, 20, DRY)
        expect(landWet(flood)).toEqual([])
    })

    it('noie la vallée, le pont et les champs au plus fort de l’orage, sans toucher la place ni les maisons', () => {
        const flood = createFlood(WORLD_MAP, terrain, solid, DRY)
        run(flood, 60, PEAK)
        expect(isFlooded(flood, {x: 43, y: 34})).toBe(true)
        expect(isFlooded(flood, {x: 38, y: 30})).toBe(true)
        expect(depthAt(flood, {x: 12, y: 47})).toBeGreaterThan(WET)
        expect(depthAt(flood, {x: 23, y: 40})).toBeLessThan(WET)
        expect(depthAt(flood, {x: 12, y: 29})).toBe(0)
        expect(depthAt(flood, {x: 26, y: 48})).toBe(0)
    })

    it('se retire quand la rivière et la nappe redescendent', () => {
        const flood = createFlood(WORLD_MAP, terrain, solid, DRY)
        run(flood, 60, PEAK)
        let drained = 0
        while (depthAt(flood, {x: 38, y: 30}) > WET && drained < 300) {
            run(flood, 1, DRY)
            drained++
        }
        // La vallée sèche reste boueuse un moment.
        expect(drained).toBeLessThan(300)
        expect(flood.mud[38 + 30 * WORLD_MAP.width]).toBeGreaterThan(0.5)
        run(flood, 300 - drained, DRY)
        expect(landWet(flood)).toEqual([])
        // Six minutes d'écoulement simulées image par image : plus long que le délai par défaut.
    }, 20000)
})

describe('Météo', () => {
    it('fait monter la rivière pendant un orage, puis la fait redescendre', () => {
        const weather = createWeather()
        startRain(weather, 3, true)
        for (let hour = 0; hour < 3; hour += 0.1) updateWeather(weather, 0.1, () => 1)
        expect(weather.rain).toBeGreaterThan(0.9)
        expect(floodLevels(weather).river).toBeGreaterThan(-0.2)
        for (let hour = 0; hour < 10; hour += 0.1) updateWeather(weather, 0.1, () => 1)
        expect(weather.rain).toBe(0)
        expect(floodLevels(weather).river).toBeCloseTo(RIVER_LEVEL)
    })

    it('ne gonfle pas la rivière pour une simple averse', () => {
        const weather = createWeather()
        startRain(weather, 4, false)
        for (let hour = 0; hour < 4; hour += 0.1) updateWeather(weather, 0.1, () => 1)
        expect(weather.rise).toBe(0)
        expect(weather.soak).toBeGreaterThan(0.5)
    })
})
