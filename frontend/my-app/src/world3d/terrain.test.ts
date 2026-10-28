import { describe, expect, it } from 'vitest'
import type { TileType, WorldMap } from '../world/types'
import { createTerrain } from './terrain'

function plainMap(): WorldMap {
    return {width: 160, height: 128, tileSize: 32, tiles: new Array<TileType>(160 * 128).fill('grass'), buildings: [], props: [], landmarks: []}
}

describe('Relief du grand Clairbois', () => {
    it('conserve les distances euclidiennes aux berges et leur interpolation entre les coins', () => {
        const map = plainMap()
        const tiles = [...map.tiles]
        tiles[90 * map.width + 80] = 'water'
        const terrain = createTerrain({...map, tiles})
        expect(terrain.height(80, 90)).toBe(-0.45)
        expect(terrain.height(83, 90)).toBe(-0.4306640625)
        expect(terrain.height(83.5, 90.5)).toBeCloseTo(-0.4084716796875, 12)
        // Cinq cases de côté donnent une distance de cinq à l'angle (triangle 3-4-5).
        expect(terrain.height(84, 95)).toBe(-0.225)
        expect(terrain.height(100, 100)).toBeCloseTo(0)
    })

    it('garde le plateau fini lorsqu’une carte ne contient aucune eau', () => {
        const terrain = createTerrain(plainMap())
        expect(terrain.height(80, 90)).toBeCloseTo(0)
        expect(terrain.height(80.5, 90.5)).toBeCloseTo(0)
        expect(terrain.height(160, 128)).toBeCloseTo(0)
    })

    it('maintient les nouvelles maisons sur leurs plateformes et applique le talus localement', () => {
        const map = plainMap()
        const tiles = [...map.tiles]
        tiles[90 * map.width + 80] = 'water'
        const terrain = createTerrain({...map, tiles, buildings: [{x: 83, y: 90, width: 4, height: 5, name: 'Maison des vergers', roof: '#635b56', model: 'fantasy_house_a'}]})
        expect(terrain.height(84, 92)).toBeCloseTo(0)
        expect(terrain.height(82, 90)).toBeCloseTo(-0.225)
        expect(terrain.height(81, 90)).toBe(-0.45)
    })
})
