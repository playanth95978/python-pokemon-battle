/**
 * Habitants à l'écran : le personnage CC0 du dresseur (Quaternius), recoloré pour chacun (chemise, pantalon,
 * cheveux, peau) et réduit pour les enfants. Seuls les habitants proches et dans le champ de la caméra sont dessinés
 * et animés : leurs maillages animés ne sont pas écartés automatiquement par three.js (voir frustumCulled).
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import type { Direction } from '../../world/types'
import type { Outfit, Pose, Villager } from './villagers'
import { positionOf } from './villagers'

const MODEL = '/models/trainer/casual_character.glb'
const ADULT_HEIGHT = 1.5, CHILD_HEIGHT = 1.05
/** Animés en dessous de cette distance (en cases), visibles en dessous de la suivante. */
const ANIMATE_DISTANCE = 22, SHOW_DISTANCE = 30
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
}
/** Matériau du modèle → pièce de la tenue. */
const OUTFIT_FOR: Record<string, keyof Outfit> = {
    White: 'shirt', LightBlue: 'pants', Hair: 'hair', Eyebrows: 'hair', Skin: 'skin', Skin_Darker: 'skin', Red_Dark: 'accent', LightBrown: 'accent',
}

interface Body {
    root: THREE.Group
    mixer: THREE.AnimationMixer
    actions: Partial<Record<Pose, THREE.AnimationAction>>
    pose: Pose | null
}

/** `ground` : hauteur du sol sous chaque habitant (relief de la vallée). */
export function createVillagerView(scene: THREE.Scene, villagers: Villager[], ground: (x: number, z: number) => number) {
    const bodies = new Map<string, Body>()
    void new GLTFLoader().loadAsync(MODEL).then((gltf) => {
        gltf.scene.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const height = box.max.y - box.min.y
        for (const villager of villagers) {
            const {outfit, child} = villager.profile
            const model = clone(gltf.scene)
            model.scale.setScalar((child ? CHILD_HEIGHT : ADULT_HEIGHT) / height)
            model.traverse((object) => {
                if (!(object instanceof THREE.Mesh)) return
                object.castShadow = true
                object.frustumCulled = false
                const recolor = (material: THREE.MeshStandardMaterial) => {
                    const part = OUTFIT_FOR[material.name]
                    if (!part) return material
                    const copy = material.clone()
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
                if (clip) actions[pose] = mixer.clipAction(clip).setEffectiveTimeScale(speed)
            }
            // Chacun démarre son cycle à un instant différent : personne ne bouge en même temps que son voisin.
            mixer.setTime(Math.random() * 3)
            bodies.set(villager.profile.id, {root, mixer, actions, pose: null})
        }
    }).catch(() => undefined)

    const bounds = new THREE.Sphere()
    return {
        /** Racines des habitants, pour les passes qui peuvent les ignorer (reflet de l'eau). */
        roots: () => [...bodies.values()].map((body) => body.root),
        update(seconds: number, around: THREE.Vector3, visible: boolean, frustum: THREE.Frustum) {
            for (const villager of villagers) {
                const body = bodies.get(villager.profile.id)
                if (!body) continue
                const at = positionOf(villager)
                const far = Math.hypot(at.x + 0.5 - around.x, at.y + 0.5 - around.z)
                body.root.position.set(at.x + 0.5, ground(at.x + 0.5, at.y + 0.5), at.y + 0.5)
                // Sphère large : un habitant juste hors champ projette encore son ombre dans l'image.
                bounds.center.set(at.x + 0.5, 0.8, at.y + 0.5)
                bounds.radius = 2
                body.root.visible = visible && !villager.inside && far < SHOW_DISTANCE && frustum.intersectsSphere(bounds)
                if (!body.root.visible) continue
                // Rotation par le plus court chemin vers la direction voulue.
                const turn = THREE.MathUtils.euclideanModulo(ANGLES[villager.facing] - body.root.rotation.y + Math.PI, Math.PI * 2) - Math.PI
                body.root.rotation.y += turn * Math.min(1, seconds * 10)
                if (far > ANIMATE_DISTANCE) continue
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
