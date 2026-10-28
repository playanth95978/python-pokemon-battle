import { describe, expect, it } from 'vitest'
import type { Position } from '../../world/types'
import { canEnter, tileAt, WORLD_MAP, WORLD_SPAWN } from '../../world/worldMap'
import { castleBlocks } from '../castle/castleArea'
import { distance } from './pathfinding'
import { advanceHour } from './villageClock'
import type { VillagePokemon } from './villagePokemon'
import { createVillagePokemon, FEAR_DISTANCE, PERCHES, pokemonAt, pokemonNear, updateVillagePokemon, VILLAGE_POKEMON } from './villagePokemon'
import type { Villager } from './villagers'
import { createVillagers, updateVillagers, VILLAGERS } from './villagers'

const passable = (tile: Position) => canEnter(tileAt(WORLD_MAP, tile), 'walking') && !castleBlocks(tile)
const key = ({x, y}: Position) => `${x},${y}`

/** Hasard reproductible (mulberry32) : un test qui échoue rejoue la même journée. */
function seeded(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0
        let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
}

function village(hour: number, seed = 1) {
    const random = seeded(seed)
    return {villagers: createVillagers(VILLAGERS, hour), pokemon: createVillagePokemon(VILLAGE_POKEMON, random), random}
}

const find = (list: VillagePokemon[], id: string) => list.find((pokemon) => pokemon.profile.id === id)!

/** Habitants et Pokémon vivent ensemble, par pas de 0,1 s ; `check` est appelé à chaque pas. */
function live(world: { villagers: Villager[]; pokemon: VillagePokemon[]; random: () => number }, from: number, to: number,
              player: Position = WORLD_SPAWN, check: (hour: number) => void = () => undefined) {
    let hour = from
    while (hour < to) {
        updateVillagers(world.villagers, hour, 0.1, player, passable, (tile) => pokemonAt(world.pokemon, tile) !== undefined)
        updateVillagePokemon(world.pokemon, hour, 0.1, {player, passable, villagers: world.villagers, random: world.random})
        check(hour)
        hour = advanceHour(hour, 0.1)
    }
}

describe('Pokémon du village', () => {
    it('partage les cases sans chevauchement : habitants, Pokémon qui marchent et dresseur', () => {
        const world = village(5)
        live(world, 5, 23, WORLD_SPAWN, (hour) => {
            const tiles = [
                ...world.villagers.filter((villager) => !villager.inside).flatMap((villager) => [villager.tile, villager.next]),
                ...world.pokemon.filter((pokemon) => pokemonAt(world.pokemon, pokemon.tile) === pokemon).flatMap((pokemon) => [pokemon.tile, pokemon.next]),
            ].filter(Boolean) as Position[]
            expect(new Set(tiles.map(key)).size, `à ${hour.toFixed(2)} h`).toBe(tiles.length)
            expect(tiles.map(key)).not.toContain(key(WORLD_SPAWN))
            for (const sheep of world.pokemon.filter((pokemon) => pokemon.profile.species === 'wattouat')) {
                const area = sheep.profile.area!
                expect(sheep.tile.x >= area.x && sheep.tile.x < area.x + area.width
                    && sheep.tile.y >= area.y && sheep.tile.y < area.y + area.height, `${key(sheep.tile)}`).toBe(true)
            }
        })
        expect(find(world.pokemon, 'ronflex')).toMatchObject({tile: {x: 15, y: 29}, pose: 'sleep'})
        expect(find(world.pokemon, 'machoc')).toMatchObject({tile: {x: 6, y: 41}, pose: 'sleep'})
    })

    it('fait travailler Machoc entre la forge et le puits pendant la journée', () => {
        const world = village(9)
        const visited = new Set<string>()
        live(world, 9, 10, WORLD_SPAWN, () => visited.add(key(find(world.pokemon, 'machoc').tile)))
        expect(visited).toContain('10,36')
        expect(visited).toContain('10,38')
    })

    it('fait suivre Bertrand par Caninos, et le fait rentrer avec lui', () => {
        const world = village(8)
        let far = 0
        live(world, 8, 10, WORLD_SPAWN, () => {
            const caninos = find(world.pokemon, 'caninos'), bertrand = world.villagers.find((villager) => villager.profile.id === 'bertrand')!
            if (distance(caninos.tile, bertrand.tile) > 3) far++
        })
        expect(far).toBeLessThan(20)
        live(world, 21.5, 23)
        expect(find(world.pokemon, 'caninos').visible).toBe(false)
    })

    it('fait fuir Évoli quand le dresseur approche', () => {
        const world = village(10)
        const evoli = find(world.pokemon, 'evoli')
        evoli.tile = {x: 12, y: 22}
        const player = {x: 12, y: 24}
        live(world, 10, 10.005, player)
        expect(evoli.pose).toBe('run')
        live(world, 10.005, 10.1, player)
        expect(distance(evoli.tile, player)).toBeGreaterThan(FEAR_DISTANCE)
    })

    it('fait s’envoler Roucool vers un perchoir éloigné du dresseur', () => {
        const world = village(10)
        const bird = find(world.pokemon, 'roucool-1')
        const player = {x: Math.round(bird.x), y: Math.round(bird.y) + 1}
        live(world, 10, 10.05, player)
        expect(bird.pose).toBe('fly')
        live(world, 10.05, 10.5, player)
        expect(bird.flight).toBeNull()
        expect(Math.hypot(PERCHES[bird.perch].x - player.x, PERCHES[bird.perch].y - player.y)).toBeGreaterThan(5)
        expect(bird.height).toBeCloseTo(PERCHES[bird.perch].height)
    })

    it('ne montre Fantominus que la nuit, et le rend approchable sur la place', () => {
        const world = village(14)
        live(world, 14, 14.1)
        expect(find(world.pokemon, 'fantominus').visible).toBe(false)
        live(world, 22, 22.1)
        const ghost = find(world.pokemon, 'fantominus')
        expect(ghost.visible).toBe(true)
        expect(pokemonNear(world.pokemon, {x: Math.round(ghost.x), y: Math.round(ghost.y)})?.profile.id).toBe('fantominus')
        expect(pokemonNear(world.pokemon, {x: 16, y: 29})?.profile.id).toBe('ronflex')
    })

    it('abrite Roucool sous la pluie et fait sauter Magicarpe dans les champs noyés', () => {
        const world = village(10)
        const pools = [{x: 12, y: 46}]
        let inField = 0
        let hour = 10
        for (let time = 0; time < 60; time += 0.1) {
            updateVillagePokemon(world.pokemon, hour, 0.1, {player: WORLD_SPAWN, passable, villagers: world.villagers, random: world.random, rain: 1, pools})
            const fish = find(world.pokemon, 'magicarpe-1')
            if (fish.visible && Math.round(fish.x) === 12 && Math.round(fish.y) === 46) inField++
            hour = advanceHour(hour, 0.1)
        }
        expect(world.pokemon.filter((pokemon) => pokemon.profile.behaviour === 'perch').every((bird) => !bird.visible)).toBe(true)
        expect(inField).toBeGreaterThan(0)
        updateVillagePokemon(world.pokemon, hour, 0.1, {player: WORLD_SPAWN, passable, villagers: world.villagers, random: world.random, rain: 0})
        expect(find(world.pokemon, 'roucool-1').visible).toBe(true)
    })
})
