import { describe, expect, it, vi } from 'vitest'
import { canEnter, tileAt, WORLD_MAP } from '../../world/worldMap'
import { castleBlocks } from '../castle/castleArea'
import { DISTRICT_POKEMON, DISTRICT_VILLAGERS, LIFE_DISTRICTS } from './districtLife'
import { createVillagePokemon, updateVillagePokemon, VILLAGE_POKEMON } from './villagePokemon'
import { createVillagers, updateVillagers, VILLAGERS } from './villagers'

describe('Vie des quartiers de Clairbois', () => {
    it('répartit les métiers et les Pokémon dans chacun des quatre nouveaux quartiers', () => {
        expect(VILLAGERS).toHaveLength(55)
        expect(VILLAGE_POKEMON).toHaveLength(65)
        expect(new Set(VILLAGERS.map((profile) => profile.id)).size).toBe(55)
        expect(new Set(VILLAGE_POKEMON.map((profile) => profile.id)).size).toBe(65)
        for (const district of LIFE_DISTRICTS) {
            const villagers = DISTRICT_VILLAGERS.filter((profile) => profile.id.startsWith(district.id))
            const pokemon = DISTRICT_POKEMON.filter((profile) => profile.id.startsWith(district.id))
            expect(villagers).toHaveLength(11)
            expect(villagers.filter((profile) => profile.child)).toHaveLength(2)
            expect(new Set(villagers.map((profile) => profile.job)).size).toBe(10)
            expect(pokemon).toHaveLength(13)
            expect(new Set(pokemon.map((profile) => profile.behaviour)).size).toBeGreaterThanOrEqual(7)
            for (const profile of pokemon.filter((profile) => profile.behaviour === 'perch')) {
                expect(profile.perches).toHaveLength(4)
                expect(profile.perches?.every((perch) => Math.abs(perch.x - district.x) <= 6 && Math.abs(perch.y - district.y) <= 4)).toBe(true)
            }
        }
    })

    it('installe les animaux terrestres sur des cases marchables et les poissons dans l’eau', () => {
        for (const profile of DISTRICT_POKEMON) {
            if (profile.behaviour === 'follower' || profile.behaviour === 'perch' || profile.behaviour === 'haunt') continue
            const positions = profile.area ? Array.from({length: profile.area.width * profile.area.height}, (_, index) => ({
                x: profile.area!.x + index % profile.area!.width,
                y: profile.area!.y + Math.floor(index / profile.area!.width),
            })) : profile.spots ?? []
            for (const position of positions) {
                const tile = tileAt(WORLD_MAP, position)
                expect(canEnter(tile, profile.behaviour === 'swim' ? 'boat' : 'walking'), `${profile.id} ${position.x},${position.y}`).toBe(true)
                expect(castleBlocks(position)).toBe(false)
            }
        }
    })

    it('synchronise le sommeil et le réveil hors champ sans recherche de chemin', () => {
        const villagers = createVillagers(DISTRICT_VILLAGERS, 10)
        const passable = vi.fn(() => true)
        const player = {x: 150, y: 120}
        updateVillagers(villagers, 23, 0.1, player, passable, () => false, false, 48)
        expect(villagers.every((villager) => villager.inside && villager.pose === 'sleep')).toBe(true)
        updateVillagers(villagers, 10, 0.1, player, passable, () => false, false, 48)
        expect(villagers.every((villager) => !villager.inside)).toBe(true)
        expect(passable).not.toHaveBeenCalled()
    })

    it('reprend la simulation d’un Pokémon seulement quand le joueur approche', () => {
        const profile = DISTRICT_POKEMON.find((candidate) => candidate.id === 'artisans-machoc-0')!
        const list = createVillagePokemon([profile], () => 0.5)
        const pokemon = list[0]
        pokemon.spotIndex = 1
        const passable = vi.fn(() => true)
        const world = {player: {x: 150, y: 120}, passable, villagers: [], random: () => 0.5, activityRadius: 48}
        updateVillagePokemon(list, 10, 0.1, world)
        expect(pokemon.next).toBeNull()
        expect(passable).not.toHaveBeenCalled()
        updateVillagePokemon(list, 10, 0.1, {...world, player: {x: 73, y: 30}})
        expect(pokemon.next).toEqual({x: 76, y: 30})
        expect(passable).toHaveBeenCalled()
    })
})
