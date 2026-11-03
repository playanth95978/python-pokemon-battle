/**
 * Habitants à l'écran : le personnage CC0 du dresseur (Quaternius), recoloré pour chacun (chemise, pantalon,
 * cheveux, peau) et réduit pour les enfants. Seuls les habitants proches et dans le champ de la caméra sont dessinés
 * et animés : leurs maillages animés ne sont pas écartés automatiquement par three.js (voir frustumCulled).
 */
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import type { Direction } from '../../world/types'
import type { Outfit, Pose, Villager } from './villagers'
import { positionOf } from './villagers'
import type { Physics } from '../physicsWorld'
import type { Limb } from './dismemberment'
import { pickSeveredLimb } from './dismemberment'
import type { Ragdoll } from './ragdoll'
import { createRagdoll } from './ragdoll'

const MODEL = '/models/trainer/casual_character.glb'
const ADULT_HEIGHT = 1.5, CHILD_HEIGHT = 1.05
/** Animés en dessous de cette distance (en cases), visibles en dessous de la suivante. */
const ANIMATE_DISTANCE = 22, SHOW_DISTANCE = 30, RELEASE_DISTANCE = 42, BUILDS_PER_FRAME = 2
const ANGLES: Record<Direction, number> = {down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2}
/** Boucle et vitesse par pose : marche à 1,6 case/s, course des enfants à 3 cases/s. */
const CLIPS: Record<Exclude<Pose, 'sleep'>, [string, number]> = {
    idle: ['CharacterArmature|Idle', 1],
    walk: ['CharacterArmature|Walk', 0.9],
    run: ['CharacterArmature|Run', 0.85],
    work: ['CharacterArmature|Interact', 0.6],
    hammer: ['CharacterArmature|Sword_Slash', 0.7],
    chat: ['CharacterArmature|Idle_Neutral', 1],
    play: ['CharacterArmature|Idle', 1.3],
    hit: ['CharacterArmature|HitRecieve', 1.4],
    dead: ['CharacterArmature|Death', 1],
}
/** Joués une fois puis figés sur leur dernière image : le recul du coup, et le corps à terre. */
const ONCE: Pose[] = ['hit', 'dead']
/** Matériau du modèle → pièce de la tenue. */
const OUTFIT_FOR: Record<string, keyof Outfit> = {
    White: 'shirt', LightBlue: 'pants', Hair: 'hair', Eyebrows: 'hair', Skin: 'skin', Skin_Darker: 'skin', Red_Dark: 'accent', LightBrown: 'accent',
}

interface Body {
    root: THREE.Group
    mixer: THREE.AnimationMixer
    actions: Partial<Record<Pose, THREE.AnimationAction>>
    pose: Pose | null
    materials: THREE.Material[]
    /** Corps devenu physique à la mort (adultes seulement) : il remplace l'animation. */
    ragdoll: Ragdoll | null
}

/** Coup mortel : où il frappe, avec quelle force, et si la lame peut trancher. */
export interface KillingBlow { point: THREE.Vector3; impulse: THREE.Vector3; cuts: boolean }

/** `ground` : hauteur du sol sous chaque habitant (relief de la vallée) ; `physics` : monde des corps tombés. */
export function createVillagerView(scene: THREE.Scene, villagers: Villager[], ground: (x: number, z: number) => number, physics: Physics) {
    const bodies = new Map<string, Body>()
    let template: GLTF | null = null
    let height = 1
    void new GLTFLoader().loadAsync(MODEL).then((gltf) => {
        gltf.scene.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(gltf.scene)
        height = box.max.y - box.min.y
        template = gltf
    }).catch(() => undefined)

    // Un seul fichier GLB partagé ; les squelettes et matériaux colorés n'existent que dans la bulle du joueur.
    function createBody(villager: Villager): Body {
        const {outfit, child} = villager.profile
        const gltf = template!
        const owned = new Map<THREE.Material, THREE.Material>()
        const model = clone(gltf.scene)
        model.scale.setScalar((child ? CHILD_HEIGHT : ADULT_HEIGHT) / height)
        model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return
            object.castShadow = true
            object.frustumCulled = false
            const recolor = (material: THREE.MeshStandardMaterial) => {
                const part = OUTFIT_FOR[material.name]
                if (!part) return material
                if (owned.has(material)) return owned.get(material)!
                const copy = material.clone()
                owned.set(material, copy)
                // Les couleurs du modèle sont très sombres : la tenue les remplace, en légèrement plus mat.
                copy.color.setHex(outfit[part])
                copy.roughness = Math.max(copy.roughness, 0.8)
                return copy
            }
            object.material = Array.isArray(object.material) ? object.material.map(recolor) : recolor(object.material)
        })
        const root = new THREE.Group()
        root.name = `habitant ${villager.profile.name}`
        root.add(model)
        scene.add(root)
        const mixer = new THREE.AnimationMixer(model)
        const actions: Body['actions'] = {}
        for (const [pose, [name, speed]] of Object.entries(CLIPS) as [Pose, [string, number]][]) {
            const clip = gltf.animations.find((animation) => animation.name === name)
            if (!clip) continue
            const action = mixer.clipAction(clip).setEffectiveTimeScale(speed)
            if (ONCE.includes(pose)) {
                action.setLoop(THREE.LoopOnce, 1)
                action.clampWhenFinished = true
            }
            actions[pose] = action
        }
        // Chacun démarre son cycle à un instant différent : personne ne bouge en même temps que son voisin.
        mixer.setTime(Math.random() * 3)
        const body: Body = {root, mixer, actions, pose: null, materials: [...owned.values()], ragdoll: null}
        bodies.set(villager.profile.id, body)
        return body
    }

    function release(id: string, body: Body) {
        body.ragdoll?.dispose()
        body.mixer.stopAllAction()
        body.mixer.uncacheRoot(body.mixer.getRoot())
        body.root.traverse((object) => { if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose() })
        body.materials.forEach((material) => material.dispose())
        body.root.removeFromParent()
        bodies.delete(id)
    }

    const bounds = new THREE.Sphere()
    return {
        /** Racines des habitants, pour les passes qui peuvent les ignorer (reflet de l'eau). */
        roots: () => [...bodies.values()].map((body) => body.root),
        /**
         * L'habitant meurt sous ce coup : son corps devient un ragdoll poussé par le coup, et une lame tranche le
         * membre le plus proche de l'impact. Renvoie le moignon qui saigne, s'il y en a un. Les enfants ne sont ni
         * démembrés ni projetés : ils gardent l'animation de chute.
         */
        kill(villager: Villager, blow: KillingBlow): { stump: THREE.Object3D | null; limb: Limb | null } {
            const body = bodies.get(villager.profile.id)
            if (!body || body.ragdoll || villager.profile.child) return {stump: null, limb: null}
            body.mixer.stopAllAction()
            const model = body.root.children[0]
            const ground = physics.groundAt(body.root.position.x, body.root.position.z)
            body.ragdoll = createRagdoll(model, physics, ground)
            if (!body.ragdoll) {
                ground.dispose()
                return {stump: null, limb: null}
            }
            body.ragdoll.push(blow.point, blow.impulse)
            if (!blow.cuts) return {stump: null, limb: null}
            const limb = pickSeveredLimb(blow.point, body.ragdoll.joints())
            if (!limb) return {stump: null, limb: null}
            return {stump: body.ragdoll.sever(limb, blow.impulse), limb}
        },
        update(seconds: number, around: THREE.Vector3, visible: boolean, frustum: THREE.Frustum) {
            let built = 0
            for (const villager of villagers) {
                let body = bodies.get(villager.profile.id)
                const at = positionOf(villager)
                const far = Math.hypot(at.x + 0.5 - around.x, at.y + 0.5 - around.z)
                // Revenu à la vie : le corps physique et coupé est jeté, un habitant entier est reconstruit.
                if (far > RELEASE_DISTANCE || villager.inside || (body?.ragdoll && !villager.down)) {
                    if (body) release(villager.profile.id, body)
                    continue
                }
                if (body?.ragdoll) {
                    body.ragdoll.update()
                    body.root.visible = visible && far < SHOW_DISTANCE
                    continue
                }
                if (!body) {
                    if (!visible || far >= SHOW_DISTANCE || !template || built >= BUILDS_PER_FRAME) continue
                    body = createBody(villager)
                    built++
                }
                body.root.position.set(at.x + 0.5, ground(at.x + 0.5, at.y + 0.5), at.y + 0.5)
                // Sphère large : un habitant juste hors champ projette encore son ombre dans l'image.
                bounds.center.set(at.x + 0.5, 0.8, at.y + 0.5)
                bounds.radius = 2
                body.root.visible = visible && !villager.inside && far < SHOW_DISTANCE && frustum.intersectsSphere(bounds)
                if (!body.root.visible) continue
                // Rotation par le plus court chemin vers la direction voulue.
                const turn = THREE.MathUtils.euclideanModulo(ANGLES[villager.facing] - body.root.rotation.y + Math.PI, Math.PI * 2) - Math.PI
                body.root.rotation.y += turn * Math.min(1, seconds * 10)
                // Un corps à terre finit de tomber même hors de la bulle animée : il ne doit pas rester debout de loin.
                if (far > ANIMATE_DISTANCE && villager.pose !== 'dead') continue
                const pose = villager.pose === 'sleep' ? 'idle' : villager.pose
                if (pose !== body.pose && body.actions[pose]) {
                    const next = body.actions[pose]!
                    next.reset().play()
                    if (body.pose) body.actions[body.pose]?.crossFadeTo(next, 0.25, false)
                    body.pose = pose
                }
                body.mixer.update(seconds)
            }
        },
    }
}
