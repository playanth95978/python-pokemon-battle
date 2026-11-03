/**
 * Chute physique d'un Pokémon abattu : la figurine devient un solide cannon-es poussé par le coup ; une lame arrache
 * la pièce la plus proche de l'impact (tête, patte, bras, aile ou queue), qui roule à part. Tout est remis en place
 * quand il revient à la vie.
 */
import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import type { Ground, Physics } from '../physicsWorld'
import type { Rig } from './pokemonKit'

interface Piece {
    object: THREE.Object3D
    body: CANNON.Body
    /** Centre du solide dans le repère de l'objet, et rattachement d'origine pour la remise en place. */
    offset: THREE.Vector3
    parent: THREE.Object3D
    position: THREE.Vector3
    quaternion: THREE.Quaternion
    scale: THREE.Vector3
}

const flesh = new THREE.MeshStandardMaterial({color: 0x7a0c0c, roughness: 0.45})
const box = new THREE.Box3(), size = new THREE.Vector3(), center = new THREE.Vector3()

/** Solide en boîte autour de `object`, à sa pose actuelle ; `object` est d'abord sorti dans la scène. */
function makePiece(object: THREE.Object3D, scene: THREE.Scene, physics: Physics, ground: Ground, mass: number): Piece {
    const parent = object.parent!
    const piece = {position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(), parent}
    scene.attach(object)
    // Boîte mesurée dans le repère propre de l'objet : orientation nulle le temps de la mesure.
    const quaternion = object.quaternion.clone()
    object.quaternion.identity()
    object.updateMatrixWorld(true)
    box.setFromObject(object).getSize(size)
    box.getCenter(center)
    object.quaternion.copy(quaternion)
    object.updateMatrixWorld(true)
    const offset = center.clone().sub(object.position)
    const body = new CANNON.Body({
        mass, collisionFilterGroup: ground.group, collisionFilterMask: ground.mask, linearDamping: 0.1, angularDamping: 0.6, allowSleep: true,
    })
    body.addShape(new CANNON.Box(new CANNON.Vec3(Math.max(0.06, size.x / 2), Math.max(0.06, size.y / 2), Math.max(0.06, size.z / 2))))
    const world = offset.clone().applyQuaternion(quaternion).add(object.position)
    body.position.set(world.x, world.y, world.z)
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
    physics.world.addBody(body)
    return {object, body, offset, ...piece}
}

export interface PokemonFall {
    update(): void
    /** Rend la figurine entière et retire ses solides. */
    restore(): void
}

/**
 * `cuts` : une lame ; elle arrache la pièce la plus proche de `point`. Renvoie la chute et le moignon qui saigne.
 */
export function fallPokemon(rig: Rig, scene: THREE.Scene, physics: Physics, ground: Ground, point: THREE.Vector3, impulse: THREE.Vector3, cuts: boolean) {
    const pieces: Piece[] = []
    // Vitesses de quelques mètres par seconde, quelle que soit l'arme : un coup renverse, il ne projette pas au loin.
    const direction = impulse.clone().setY(0).normalize()
    let stump: THREE.Mesh | null = null
    if (cuts) {
        const candidates = [rig.head, ...rig.legs, ...rig.arms, ...rig.wings, rig.tail].filter((part): part is THREE.Group => part !== null)
        const away = (part: THREE.Object3D) => part.getWorldPosition(new THREE.Vector3()).distanceTo(point)
        const torn = candidates.sort((a, b) => away(a) - away(b))[0]
        if (torn) {
            const joint = torn.getWorldPosition(new THREE.Vector3())
            const severed = makePiece(torn, scene, physics, ground, 0.6)
            severed.body.applyImpulse(new CANNON.Vec3(direction.x * 0.6 * 2, 0.6 * 2.5, direction.z * 0.6 * 2))
            pieces.push(severed)
            // Plaie : une boule de chair à l'attache, sur le corps ; c'est d'elle que le sang gicle.
            stump = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), flesh)
            stump.position.copy(joint)
            stump.lookAt(joint.clone().add(new THREE.Vector3(0, 1, 0)))
            rig.root.attach(stump)
        }
    }
    const main = makePiece(rig.root, scene, physics, ground, 8)
    main.body.applyImpulse(new CANNON.Vec3(direction.x * 8 * 2.5, 8 * 1.5, direction.z * 8 * 2.5), new CANNON.Vec3(point.x, point.y, point.z))
    pieces.push(main)
    const quaternion = new THREE.Quaternion()

    const fall: PokemonFall = {
        update() {
            for (const {object, body, offset} of pieces) {
                quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
                object.quaternion.copy(quaternion)
                object.position.copy(offset).applyQuaternion(quaternion).negate()
                object.position.x += body.position.x
                object.position.y += body.position.y
                object.position.z += body.position.z
            }
        },
        restore() {
            for (const piece of pieces.reverse()) {
                physics.world.removeBody(piece.body)
                piece.parent.add(piece.object)
                piece.object.position.copy(piece.position)
                piece.object.quaternion.copy(piece.quaternion)
                piece.object.scale.copy(piece.scale)
            }
            ground.dispose()
            if (stump) {
                stump.removeFromParent()
                stump.geometry.dispose()
            }
        },
    }
    return {fall, stump}
}
