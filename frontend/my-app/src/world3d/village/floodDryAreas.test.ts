import { describe, expect, it } from 'vitest'
import type { TileType, WorldMap } from '../../world/types'
import { createFlood, stepFlood } from './flood'

function dryFlood() {
    const map: WorldMap = {width: 6, height: 5, tileSize: 32, tiles: new Array<TileType>(30).fill('grass'), buildings: [], props: [], landmarks: []}
    return createFlood(map, {height: () => 0, tile: () => 0}, () => false, {river: -0.55, table: -0.6})
}

describe('Écoulement dans les quartiers secs', () => {
    it('annule les anciens débits d’une case vide sans créer d’eau', () => {
        const flood = dryFlood()
        flood.flux.fill(0.2)
        stepFlood(flood, 1 / 30, {river: -0.55, table: -0.6})
        expect([...flood.depth]).toEqual(new Array(30).fill(0))
        expect([...flood.flux]).toEqual(new Array(120).fill(0))
    })

    it('réveille le sol sec dès que la nappe dépasse sa hauteur', () => {
        const flood = dryFlood()
        stepFlood(flood, 1 / 30, {river: -0.55, table: -0.6})
        stepFlood(flood, 1 / 30, {river: -0.55, table: 0.2})
        expect(flood.depth[14]).toBeCloseTo(0.0013333333)
        expect([...flood.depth].every((depth) => depth > 0)).toBe(true)
    })

    it('fait entrer l’eau dans les cases sèches voisines et conserve la masse hors infiltration', () => {
        const flood = dryFlood()
        flood.depth[14] = 1
        stepFlood(flood, 1 / 30, {river: -0.55, table: -0.6})
        expect(flood.depth[14]).toBeLessThan(1)
        for (const neighbour of [8, 13, 15, 20]) expect(flood.depth[neighbour]).toBeGreaterThan(0)
        const total = flood.depth.reduce((sum, depth) => sum + depth, 0)
        expect(total).toBeCloseTo(1 - 5 * 0.0025 / 30)
    })
})
