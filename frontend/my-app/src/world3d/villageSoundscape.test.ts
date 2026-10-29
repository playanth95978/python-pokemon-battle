import { describe, expect, it } from 'vitest'
import type { WorldMap } from '../world/types'
import { createVillagers, VILLAGERS } from './village/villagers'
import { createVillagePokemon, VILLAGE_POKEMON } from './village/villagePokemon'
import { actorEmitters, ambientNear, environmentEmitters, proximity } from './villageSoundscape'
import type { SoundEmitter } from './villageSoundscape'

describe('Proximité des sons du village', () => {
    it('atténue progressivement jusqu’au silence au-delà de la portée', () => {
        const water: SoundEmitter = {id: 'river', kind: 'water', x: 10, y: 20, radius: 10, level: 1}
        expect(proximity(water, {x: 10.5, z: 20.5})).toBe(1)
        expect(proximity(water, {x: 16.5, z: 20.5})).toBe(0.25)
        expect(proximity(water, {x: 20.5, z: 20.5})).toBe(0)
        expect(proximity(water, {x: 100, z: 20.5})).toBe(0)
    })

    it('groupe la végétation et l’eau par secteur, avec une source propre à chaque fontaine', () => {
        const map: WorldMap = {width: 16, height: 8, tileSize: 32, tiles: Array.from({length: 128}, (_, index) => index % 16 < 8 ? 'tree' : 'water'),
            buildings: [], landmarks: [], props: [{x: 3, y: 4, kind: 'fountain'}]}
        const emitters = environmentEmitters(map)
        expect(emitters).toHaveLength(3)
        expect(emitters.find((emitter) => emitter.kind === 'water')).toMatchObject({x: 11.5, y: 3.5, radius: 20})
        expect(emitters.find((emitter) => emitter.kind === 'fountain')).toMatchObject({x: 3.5, y: 4.5})
    })

    it('limite les boucles proches sans laisser une forêt couvrir toutes les ambiances', () => {
        const emitters: SoundEmitter[] = Array.from({length: 60}, (_, index) => ({id: String(index), kind: index < 30 ? 'leaves' : 'water', x: index % 5, y: 0, radius: 20, level: 1}))
        emitters.push({id: 'fountain', kind: 'fountain', x: 1, y: 0, radius: 12, level: 1})
        const near = ambientNear(emitters, {x: 0, y: 0, z: 0})
        expect(near).toHaveLength(5)
        expect(near.filter((emitter) => emitter.kind === 'leaves')).toHaveLength(2)
        expect(near.some((emitter) => emitter.kind === 'fountain')).toBe(true)
        expect(ambientNear(emitters, {x: 1000, y: 0, z: 1000})).toEqual([])
    })

    it('ignore les habitants dans leur maison et les Pokémon invisibles sans modifier leur état', () => {
        const villagers = createVillagers(VILLAGERS.slice(0, 2), 9)
        villagers[0].inside = true
        villagers[1].tile = {x: 3, y: 3}; villagers[1].next = null
        const pokemon = createVillagePokemon(VILLAGE_POKEMON.slice(0, 1), () => 0.5)
        pokemon[0].visible = false
        const before = JSON.stringify({villagers, pokemon})
        const emitters = actorEmitters({listener: {x: 3.5, y: 0, z: 3.5}, forward: {x: 0, y: 0, z: -1}, villagers, pokemon, extraPokemon: [], rain: 0})
        expect(emitters.map((emitter) => emitter.id)).toEqual([villagers[1].profile.id])
        expect(JSON.stringify({villagers, pokemon})).toBe(before)
    })
})
