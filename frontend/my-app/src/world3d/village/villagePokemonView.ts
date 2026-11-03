/** Pokémon du village à l'écran : figurines du kit, placées et animées d'après leur comportement (villagePokemon.ts). */
import * as THREE from 'three'
import type { Rig } from './pokemonKit'
import { animatePokemon, buildPokemon } from './pokemonKit'
import type { VillagePokemon } from './villagePokemon'
import { pokemonPosition } from './villagePokemon'
import type { Physics } from '../physicsWorld'
import type { PokemonFall } from './pokemonFall'
import { fallPokemon } from './pokemonFall'
import type { KillingBlow } from './villagerView'

/** Animés en dessous de cette distance (en cases), visibles en dessous de la suivante. */
const ANIMATE_DISTANCE = 22, SHOW_DISTANCE = 32, RELEASE_DISTANCE = 44, BUILDS_PER_FRAME = 2

/** `ground` : hauteur du sol ; `water` : niveau de l'eau où nage Magicarpe (rivière, lac ou champ noyé). */
export function createVillagePokemonView(scene: THREE.Scene, list: VillagePokemon[], ground: (x: number, z: number) => number,
                                         water: (x: number, z: number) => number, physics: Physics) {
    // Les géométries et matériaux du kit restent partagés ; seuls les objets proches sont instanciés.
    const rigs = new Map<VillagePokemon, Rig>()
    const previousHeight = new Map<VillagePokemon, number>()
    /** Pokémon abattus dont la figurine est confiée à la physique. */
    const falls = new Map<VillagePokemon, PokemonFall>()
    function forget(pokemon: VillagePokemon) {
        falls.get(pokemon)?.restore()
        falls.delete(pokemon)
    }

    return {
        roots: () => [...rigs.values()].map((rig) => rig.root),
        /** Le Pokémon tombe sous ce coup ; une lame lui arrache une pièce. Renvoie la plaie qui saigne, s'il y en a une. */
        kill(pokemon: VillagePokemon, blow: KillingBlow): THREE.Object3D | null {
            const rig = rigs.get(pokemon)
            if (!rig || falls.has(pokemon)) return null
            const {fall, stump} = fallPokemon(rig, scene, physics, physics.groundAt(rig.root.position.x, rig.root.position.z), blow.point, blow.impulse, blow.cuts)
            falls.set(pokemon, fall)
            return stump
        },
        update(time: number, seconds: number, around: THREE.Vector3, visible: boolean) {
            let built = 0
            for (let index = 0; index < list.length; index++) {
                const pokemon = list[index], phase = index * 1.7
                let rig = rigs.get(pokemon)
                const at = pokemonPosition(pokemon)
                const far = Math.hypot(at.x + 0.5 - around.x, at.y + 0.5 - around.z)
                if (far > RELEASE_DISTANCE) {
                    if (rig) {
                        // Aucune libération GPU ici : les autres Pokémon utilisent ces mêmes ressources du kit.
                        forget(pokemon)
                        rig.root.removeFromParent()
                        rigs.delete(pokemon)
                        previousHeight.delete(pokemon)
                    }
                    continue
                }
                if (!rig) {
                    if (!visible || !pokemon.visible || far >= SHOW_DISTANCE || built >= BUILDS_PER_FRAME) continue
                    rig = buildPokemon(pokemon.profile.species)
                    rig.root.name = `pokémon ${pokemon.profile.name}`
                    rigs.set(pokemon, rig)
                    scene.add(rig.root)
                    built++
                }
                rig.root.visible = visible && pokemon.visible && far < SHOW_DISTANCE
                const fall = falls.get(pokemon)
                if (fall && pokemon.down) {
                    fall.update()
                    continue
                }
                // Revenu à la vie : la figurine est remise d'aplomb, entière, à sa place.
                if (fall) {
                    forget(pokemon)
                    scene.add(rig.root)
                    rig.root.rotation.set(0, pokemon.heading, 0)
                }
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
                // Tué hors de vue (pas de chute physique) : couché sur le flanc. Sonné : il tremble.
                const lying = pokemon.down ? Math.PI / 2 : 0
                rig.root.rotation.z = THREE.MathUtils.lerp(rig.root.rotation.z, lying, Math.min(1, seconds * 6))
                if (pokemon.down) continue
                if (pokemon.stagger > 0) rig.root.rotation.z += Math.sin(time * 45) * 0.12 * Math.min(1, pokemon.stagger * 2)
                if (far < ANIMATE_DISTANCE) animatePokemon(rig, pokemon.profile.species, pokemon.pose, time, phase)
            }
        },
    }
}
