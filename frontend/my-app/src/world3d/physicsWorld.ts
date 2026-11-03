/**
 * Monde physique (cannon-es) des corps tombés : ragdolls, membres tranchés, Pokémon abattus.
 *
 * Le sol de chaque corps est un plan incliné selon la pente du terrain là où il tombe. Le contact boîte-plan est le
 * plus fiable de cannon-es ; celui des boîtes contre un relief maillé (heightfield) éjecte les solides fins à
 * plusieurs mètres dès que le terrain penche, et des sphères, elles, roulent sans fin. Le terrain du village est assez
 * doux pour qu'un plan local suffise sur les quelques mètres où un corps et ses membres retombent.
 *
 * Chaque corps a son propre plan, et ne touche que lui : deux bits de collision par chute (le plan dans l'un, les
 * solides du corps dans l'autre), si bien que les parties d'un même corps ne se cognent pas entre elles non plus.
 */
import * as CANNON from 'cannon-es'

/** Pas fixe de la simulation : stable quelle que soit la fréquence d'affichage. */
const FIXED_STEP = 1 / 120
/** Vitesses maximales d'un corps (m/s) et de sa rotation (rad/s) : garde-fou contre un solide coincé puis éjecté. */
const MAX_SPEED = 12, MAX_SPIN = 25
/** Paires de bits de collision disponibles (30 bits utiles) : quinze chutes simultanées, puis on réutilise. */
const PAIRS = 15

export interface Ground {
    /** Filtre de collision à donner aux solides du corps : ils ne touchent que ce sol. */
    group: number
    mask: number
    dispose(): void
}

export type Physics = ReturnType<typeof createPhysics>

export function createPhysics(height: (x: number, z: number) => number) {
    const world = new CANNON.World({gravity: new CANNON.Vec3(0, -9.82, 0)})
    world.allowSleep = true
    world.broadphase = new CANNON.NaiveBroadphase()
    // Une chaîne de onze solides articulés demande plus d'itérations que le réglage par défaut pour rester tenue.
    ;(world.solver as CANNON.GSSolver).iterations = 20
    // Vêtements et peau sur la terre battue : un corps tombé ne glisse pas, il s'arrête là où il est tombé.
    world.defaultContactMaterial.friction = 1
    world.defaultContactMaterial.restitution = 0.05
    let nextPair = 0

    return {
        world,
        /** Sol d'un corps tombé en (x, z) : un plan qui suit la pente du terrain à cet endroit. */
        groundAt(x: number, z: number): Ground {
            const pair = nextPair++ % PAIRS
            const planeBit = 1 << (pair * 2), bodyBit = 1 << (pair * 2 + 1)
            const slopeX = (height(x + 0.5, z) - height(x - 0.5, z)), slopeZ = (height(x, z + 0.5) - height(x, z - 0.5))
            const normal = new CANNON.Vec3(-slopeX, 1, -slopeZ)
            normal.normalize()
            const plane = new CANNON.Body({mass: 0, collisionFilterGroup: planeBit, collisionFilterMask: bodyBit})
            plane.addShape(new CANNON.Plane())
            // Le plan de cannon regarde vers +Z : on l'oriente selon la normale du terrain.
            plane.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), normal)
            plane.position.set(x, height(x, z), z)
            world.addBody(plane)
            return {group: bodyBit, mask: planeBit, dispose: () => world.removeBody(plane)}
        },
        step(seconds: number) {
            world.step(FIXED_STEP, seconds, 8)
            for (const body of world.bodies) {
                if (body.mass === 0) continue
                const speed = body.velocity.length()
                if (speed > MAX_SPEED) body.velocity.scale(MAX_SPEED / speed, body.velocity)
                const spin = body.angularVelocity.length()
                if (spin > MAX_SPIN) body.angularVelocity.scale(MAX_SPIN / spin, body.angularVelocity)
            }
        },
    }
}
