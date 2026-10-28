/** Pokémon du village à l'écran : figurines du kit, placées et animées d'après leur comportement (villagePokemon.ts). */
import * as THREE from 'three'
import type { Rig } from './pokemonKit'
import { animatePokemon, buildPokemon } from './pokemonKit'
import type { VillagePokemon } from './villagePokemon'
import { pokemonPosition } from './villagePokemon'

/** Animés en dessous de cette distance (en cases), visibles en dessous de la suivante. */
const ANIMATE_DISTANCE = 22, SHOW_DISTANCE = 32

/** `ground` : hauteur du sol ; `water` : niveau de l'eau où nage Magicarpe (rivière, lac ou champ noyé). */
export function createVillagePokemonView(scene: THREE.Scene, list: VillagePokemon[], ground: (x: number, z: number) => number,
                                         water: (x: number, z: number) => number) {
    const rigs = list.map((pokemon, index): [VillagePokemon, Rig, number] => {
        const rig = buildPokemon(pokemon.profile.species)
        rig.root.name = `pokémon ${pokemon.profile.name}`
        scene.add(rig.root)
        return [pokemon, rig, index * 1.7]
    })
    const previousHeight = new Map<VillagePokemon, number>()

    return {
        roots: () => rigs.map(([, rig]) => rig.root),
        update(time: number, seconds: number, around: THREE.Vector3, visible: boolean) {
            for (const [pokemon, rig, phase] of rigs) {
                const at = pokemonPosition(pokemon)
                const far = Math.hypot(at.x + 0.5 - around.x, at.y + 0.5 - around.z)
                rig.root.visible = visible && pokemon.visible && far < SHOW_DISTANCE
                if (!rig.root.visible) continue
                const swim = pokemon.profile.behaviour === 'swim'
                const x = at.x + 0.5, z = at.y + 0.5
                rig.root.position.set(x, (swim ? water(x, z) : ground(x, z)) + pokemon.height, z)
                const turn = THREE.MathUtils.euclideanModulo(pokemon.heading - rig.root.rotation.y + Math.PI, Math.PI * 2) - Math.PI
                rig.root.rotation.y += turn * Math.min(1, seconds * 8)
                // Magicarpe pique du nez en suivant son saut.
                if (swim) {
                    const rise = pokemon.height - (previousHeight.get(pokemon) ?? pokemon.height)
                    rig.root.rotation.x = THREE.MathUtils.lerp(rig.root.rotation.x, -Math.atan2(rise, seconds * 1.2 || 1), 0.5)
                    previousHeight.set(pokemon, pokemon.height)
                }
                if (far < ANIMATE_DISTANCE) animatePokemon(rig, pokemon.profile.species, pokemon.pose, time, phase)
            }
        },
    }
}
