/** Plan sonore pur : les positions viennent du village, sans créer de nœud audio ni modifier les acteurs. */
import type { Position, WorldMap } from '../world/types'
import { positionOf, type Villager } from './village/villagers'
import { pokemonPosition, type VillagePokemon } from './village/villagePokemon'

export type SoundKind = 'water' | 'leaves' | 'fountain' | 'voice' | 'child' | 'hammer' | 'branch' | 'cry'
export interface SoundEmitter extends Position { id: string; kind: SoundKind; radius: number; level: number; species?: string }
export interface AudioPosition { x: number; y: number; z: number }
export interface VillageAudioFrame {
    listener: AudioPosition
    forward: AudioPosition
    villagers: readonly Villager[]
    pokemon: readonly VillagePokemon[]
    extraPokemon: readonly (Position & {id: string; species: string})[]
    rain: number
}
export const MAX_AMBIENT_SOURCES = 5
export const MAX_SHORT_SOUNDS = 4

/** Atténuation douce jusqu'au silence, sans palier audible au bord de la portée. */
export function proximity(emitter: SoundEmitter, listener: Pick<AudioPosition, 'x' | 'z'>) {
    const distance = Math.hypot(emitter.x + 0.5 - listener.x, emitter.y + 0.5 - listener.z)
    return Math.pow(Math.max(0, 1 - Math.max(0, distance - 2) / (emitter.radius - 2)), 2)
}

export function environmentEmitters(map: WorldMap): SoundEmitter[] {
    const buckets = new Map<string, {kind: 'water' | 'leaves'; x: number; y: number; count: number}>()
    map.tiles.forEach((tile, index) => {
        if (tile !== 'tree' && tile !== 'water') return
        const x = index % map.width, y = Math.floor(index / map.width), kind = tile === 'tree' ? 'leaves' : 'water'
        const id = `${kind}-${Math.floor(x / 8)}-${Math.floor(y / 8)}`
        const bucket = buckets.get(id) ?? {kind, x: 0, y: 0, count: 0}
        bucket.x += x; bucket.y += y; bucket.count++
        buckets.set(id, bucket)
    })
    return [...buckets].map(([id, bucket]): SoundEmitter => ({id, kind: bucket.kind,
        x: bucket.x / bucket.count, y: bucket.y / bucket.count, radius: bucket.kind === 'water' ? 20 : 15,
        level: bucket.kind === 'water' ? 0.2 : 0.085,
    })).concat(map.props.filter((prop) => prop.kind === 'fountain').map((prop) => ({
        id: `fountain-${prop.x}-${prop.y}`, kind: 'fountain', x: prop.x + 0.5, y: prop.y + 0.5, radius: 13, level: 0.16,
    })))
}

export function ambientNear(emitters: readonly SoundEmitter[], listener: AudioPosition) {
    const nearest = emitters.filter((emitter) => proximity(emitter, listener) > 0)
        .sort((a, b) => proximity(b, listener) - proximity(a, listener))
    // Une rivière ou une forêt très dense ne masque pas toutes les autres ambiances.
    const count = new Map<SoundKind, number>()
    return nearest.filter((emitter) => {
        const used = count.get(emitter.kind) ?? 0
        count.set(emitter.kind, used + 1)
        return used < (emitter.kind === 'fountain' ? 1 : 2)
    }).slice(0, MAX_AMBIENT_SOURCES)
}

export function actorEmitters(frame: VillageAudioFrame): SoundEmitter[] {
    const people = frame.villagers.filter((villager) => !villager.inside && villager.pose !== 'sleep').map((villager): SoundEmitter => ({
        ...positionOf(villager), id: villager.profile.id, kind: villager.pose === 'hammer' ? 'hammer' : villager.profile.child ? 'child' : 'voice',
        radius: villager.pose === 'hammer' ? 16 : 10, level: villager.pose === 'hammer' ? 0.22 : 0.2,
    }))
    const creatures = frame.pokemon.filter((pokemon) => pokemon.visible).map((pokemon): SoundEmitter => ({
        ...pokemonPosition(pokemon), id: pokemon.profile.id, kind: 'cry', species: pokemon.profile.speciesKey, radius: 16, level: 0.45,
    }))
    return [...people, ...creatures, ...frame.extraPokemon.map((pokemon): SoundEmitter => ({
        ...pokemon, kind: 'cry', radius: pokemon.species === 'pikachu' ? 9 : 16, level: 0.4,
    }))].filter((emitter) => proximity(emitter, frame.listener) > 0)
        .sort((a, b) => proximity(b, frame.listener) - proximity(a, frame.listener))
}
