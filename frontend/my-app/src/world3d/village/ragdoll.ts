/**
 * Ragdoll d'un habitant tué : chaque partie du corps (bassin, torse, tête, bras, avant-bras, cuisses, jambes) devient un
 * solide cannon-es taillé sur les os du modèle au moment de la mort, relié aux autres par des rotules aux limites
 * humaines. Les os suivent ensuite leur solide à chaque image, l'animation est arrêtée. Un coup d'épée peut rompre
 * une articulation : le membre part avec ses os, et le maillage est coupé à cet endroit (voir dismemberment.ts).
 */
import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import type { Ground, Physics } from '../physicsWorld'
import type { Limb, Point3 } from './dismemberment'
import { cutTriangles, dominantBones, LIMBS } from './dismemberment'

type Part = 'pelvis' | 'torso' | 'head' | 'armL' | 'armR' | 'forearmL' | 'forearmR' | 'thighL' | 'thighR' | 'shinL' | 'shinR'

interface PartDefinition {
    part: Part
    /** Le solide va de l'os `from` à l'os `to` (prolongé de `extend`, en part de sa longueur, pour la main ou le crâne). */
    from: string
    to: string
    extend?: number
    /** Épaisseur et masse : des proportions humaines, pour des chutes crédibles. */
    thickness: [number, number]
    mass: number
    /** Os pilotés par ce solide. */
    drives: string[]
}

const PARTS: PartDefinition[] = [
    {part: 'pelvis', from: 'Hips', to: 'Torso', thickness: [0.3, 0.2], mass: 11, drives: ['Body']},
    {part: 'torso', from: 'Torso', to: 'Neck', thickness: [0.34, 0.2], mass: 16, drives: ['Chest']},
    {part: 'head', from: 'Neck', to: 'Head', extend: 2.2, thickness: [0.2, 0.22], mass: 5, drives: ['Head']},
    {part: 'armL', from: 'UpperArmL', to: 'LowerArmL', thickness: [0.09, 0.09], mass: 2.2, drives: ['UpperArmL']},
    {part: 'armR', from: 'UpperArmR', to: 'LowerArmR', thickness: [0.09, 0.09], mass: 2.2, drives: ['UpperArmR']},
    {part: 'forearmL', from: 'LowerArmL', to: 'WristL', extend: 0.5, thickness: [0.08, 0.08], mass: 1.6, drives: ['LowerArmL']},
    {part: 'forearmR', from: 'LowerArmR', to: 'WristR', extend: 0.5, thickness: [0.08, 0.08], mass: 1.6, drives: ['LowerArmR']},
    {part: 'thighL', from: 'UpperLegL', to: 'LowerLegL', thickness: [0.14, 0.14], mass: 7, drives: ['UpperLegL']},
    {part: 'thighR', from: 'UpperLegR', to: 'LowerLegR', thickness: [0.14, 0.14], mass: 7, drives: ['UpperLegR']},
    {part: 'shinL', from: 'LowerLegL', to: 'FootL', thickness: [0.11, 0.11], mass: 4, drives: ['LowerLegL', 'FootL', 'PTL']},
    {part: 'shinR', from: 'LowerLegR', to: 'FootR', thickness: [0.11, 0.11], mass: 4, drives: ['LowerLegR', 'FootR', 'PTR']},
]

/** Articulations : rotule à l'os `pivot`, débattement en cône et en torsion (radians), proche d'un corps humain. */
const JOINTS: { parent: Part; child: Part; pivot: string; cone: number; twist: number }[] = [
    {parent: 'pelvis', child: 'torso', pivot: 'Torso', cone: 0.45, twist: 0.35},
    {parent: 'torso', child: 'head', pivot: 'Neck', cone: 0.6, twist: 0.8},
    {parent: 'torso', child: 'armL', pivot: 'UpperArmL', cone: 1.5, twist: 0.9},
    {parent: 'torso', child: 'armR', pivot: 'UpperArmR', cone: 1.5, twist: 0.9},
    {parent: 'armL', child: 'forearmL', pivot: 'LowerArmL', cone: 1.2, twist: 0.4},
    {parent: 'armR', child: 'forearmR', pivot: 'LowerArmR', cone: 1.2, twist: 0.4},
    {parent: 'pelvis', child: 'thighL', pivot: 'UpperLegL', cone: 1.1, twist: 0.4},
    {parent: 'pelvis', child: 'thighR', pivot: 'UpperLegR', cone: 1.1, twist: 0.4},
    {parent: 'thighL', child: 'shinL', pivot: 'LowerLegL', cone: 1.0, twist: 0.15},
    {parent: 'thighR', child: 'shinR', pivot: 'LowerLegR', cone: 1.0, twist: 0.15},
]
/** Ordre de pilotage : un parent avant ses enfants, pour lire sa matrice à jour. */
const DRIVE_ORDER = ['Body', 'Chest', 'Head', 'UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR',
    'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR', 'FootL', 'PTL', 'FootR', 'PTR']
/** Le membre coupé, et le solide qui part avec lui. */
const LIMB_PART: Record<Limb, Part> = {
    head: 'head', armL: 'armL', armR: 'armR', forearmL: 'forearmL', forearmR: 'forearmR',
    thighL: 'thighL', thighR: 'thighR', shinL: 'shinL', shinR: 'shinR',
}

/** Vitesse ajoutée à la partie touchée (m/s), et à un membre tranché, dans le sens du coup et vers le haut. */
const LOCAL_KICK = 1.5, SEVER_SPEED = 1.2

const flesh = new THREE.MeshStandardMaterial({color: 0x7a0c0c, roughness: 0.45, side: THREE.DoubleSide})
const UP = new THREE.Vector3(0, 1, 0), FORWARD = new THREE.Vector3(0, 0, 1)

interface Driven { bone: THREE.Bone; body: CANNON.Body; offsetPosition: THREE.Vector3; offsetQuaternion: THREE.Quaternion; scale: THREE.Vector3 }

export interface Ragdoll {
    update(): void
    /** Articulations des membres dans le monde, pour choisir lequel une lame emporte. */
    joints(): Partial<Record<Limb, Point3>>
    /** Pousse la partie la plus proche du point d'impact (impulsion en N·s). */
    push(point: THREE.Vector3, impulse: THREE.Vector3): void
    /** Tranche un membre ; renvoie le moignon (côté corps) pour le sang, ou `null` s'il était déjà parti. */
    sever(limb: Limb, impulse: THREE.Vector3): THREE.Object3D | null
    dispose(): void
}

/** `model` : la scène clonée du personnage, déjà posée dans le monde, animation arrêtée. */
export function createRagdoll(model: THREE.Object3D, physics: Physics, ground: Ground): Ragdoll | null {
    const bones = new Map<string, THREE.Bone>()
    model.traverse((object) => { if (object instanceof THREE.Bone) bones.set(object.name, object) })
    if (PARTS.some(({from, to}) => !bones.has(from) || !bones.has(to))) return null
    model.updateMatrixWorld(true)
    const at = (name: string) => bones.get(name)!.getWorldPosition(new THREE.Vector3())
    const height = at('Head').y - Math.min(at('FootL').y, at('FootR').y)
    // Épaisseurs données pour 1,5 m de haut.
    const scale = height / 1.3

    const bodies = new Map<Part, CANNON.Body>()
    const axes = new Map<Part, THREE.Vector3>()
    for (const definition of PARTS) {
        const from = at(definition.from), to = at(definition.to)
        const axis = to.clone().sub(from)
        const length = Math.max(0.05, axis.length() * (1 + (definition.extend ?? 0)))
        axis.normalize()
        const center = from.clone().addScaledVector(axis, length / 2)
        const orientation = new THREE.Quaternion().setFromUnitVectors(UP, axis)
        const [width, depth] = definition.thickness
        const body = new CANNON.Body({
            mass: definition.mass, collisionFilterGroup: ground.group, collisionFilterMask: ground.mask,
            linearDamping: 0.2, angularDamping: 0.6, allowSleep: true, sleepSpeedLimit: 0.3, sleepTimeLimit: 0.5,
        })
        body.addShape(new CANNON.Box(new CANNON.Vec3(width * scale / 2, length / 2, depth * scale / 2)))
        body.position.set(center.x, center.y, center.z)
        body.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w)
        physics.world.addBody(body)
        bodies.set(definition.part, body)
        axes.set(definition.part, axis)
    }

    const constraints = new Map<Part, CANNON.Constraint>()
    const local = (body: CANNON.Body, point: THREE.Vector3) => body.pointToLocalFrame(new CANNON.Vec3(point.x, point.y, point.z))
    const localAxis = (body: CANNON.Body, axis: THREE.Vector3) => body.vectorToLocalFrame(new CANNON.Vec3(axis.x, axis.y, axis.z))
    for (const joint of JOINTS) {
        const parent = bodies.get(joint.parent)!, child = bodies.get(joint.child)!, pivot = at(joint.pivot), axis = axes.get(joint.child)!
        const constraint = new CANNON.ConeTwistConstraint(parent, child, {
            pivotA: local(parent, pivot), pivotB: local(child, pivot), axisA: localAxis(parent, axis), axisB: localAxis(child, axis),
            angle: joint.cone, twistAngle: joint.twist, collideConnected: false,
        })
        physics.world.addConstraint(constraint)
        constraints.set(joint.child, constraint)
    }

    // Décalage de chaque os piloté dans le repère de son solide : l'os garde sa pose de la mort relativement à lui.
    const driven: Driven[] = []
    for (const name of DRIVE_ORDER) {
        const bone = bones.get(name)
        const part = PARTS.find((definition) => definition.drives.includes(name))
        if (!bone || !part) continue
        const body = bodies.get(part.part)!
        const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), boneScale = new THREE.Vector3()
        bone.matrixWorld.decompose(position, quaternion, boneScale)
        const bodyQuaternion = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
        const inverse = bodyQuaternion.clone().invert()
        driven.push({
            bone, body, scale: boneScale,
            offsetPosition: position.sub(new THREE.Vector3(body.position.x, body.position.y, body.position.z)).applyQuaternion(inverse),
            offsetQuaternion: inverse.multiply(quaternion),
        })
    }

    const meshes: THREE.SkinnedMesh[] = []
    model.traverse((object) => { if (object instanceof THREE.SkinnedMesh) meshes.push(object) })
    const ownGeometries: THREE.BufferGeometry[] = []
    const caps: THREE.Object3D[] = []
    const severed = new Set<Limb>()

    const world = new THREE.Matrix4(), inverseParent = new THREE.Matrix4()
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion()

    /** Retire de chaque maillage les triangles à cheval sur la coupure du membre (os `boneNames`). */
    function cut(boneNames: Set<string>) {
        for (const mesh of meshes) {
            const inLimb = mesh.skeleton.bones.map((bone) => boneNames.has(bone.name))
            if (!inLimb.some(Boolean)) continue
            // Le clone du personnage partage sa géométrie avec les autres habitants : on la copie avant de la couper.
            if (!ownGeometries.includes(mesh.geometry)) {
                mesh.geometry = mesh.geometry.clone()
                ownGeometries.push(mesh.geometry)
            }
            const geometry = mesh.geometry
            const count = geometry.attributes.position.count
            const dominant = dominantBones(geometry.attributes.skinIndex.array, geometry.attributes.skinWeight.array, count)
            const owner = Array.from(dominant, (bone) => inLimb[bone] ?? false)
            const index = geometry.index ? geometry.index.array : Array.from({length: count}, (_, vertex) => vertex)
            geometry.setIndex(cutTriangles(index, owner))
        }
    }

    /** Disque de chair à la coupure, accroché à l'os pour suivre son morceau ; `normal` sort de la plaie. */
    function cap(bone: THREE.Object3D, center: THREE.Vector3, normal: THREE.Vector3, radius: number) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 14), flesh)
        disc.position.copy(center)
        disc.quaternion.setFromUnitVectors(FORWARD, normal)
        bone.attach(disc)
        caps.push(disc)
        return disc
    }

    return {
        update() {
            for (const {bone, body, offsetPosition, offsetQuaternion, scale} of driven) {
                quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
                position.copy(offsetPosition).applyQuaternion(quaternion)
                position.x += body.position.x
                position.y += body.position.y
                position.z += body.position.z
                quaternion.multiply(offsetQuaternion)
                world.compose(position, quaternion, scale)
                inverseParent.copy(bone.parent!.matrixWorld).invert()
                world.premultiply(inverseParent).decompose(bone.position, bone.quaternion, bone.scale)
                bone.updateMatrixWorld(true)
            }
        },
        joints() {
            const result: Partial<Record<Limb, Point3>> = {}
            for (const {limb, bone} of LIMBS) {
                if (severed.has(limb)) continue
                const at = bones.get(bone)?.getWorldPosition(new THREE.Vector3())
                if (at) result[limb] = at
            }
            return result
        },
        push(point, impulse) {
            // Le coup déplace tout le corps (réparti selon les masses), et la partie touchée un peu plus, sans dépasser
            // quelques mètres par seconde : une tête de 5 kg ne doit pas partir comme un boulet.
            let nearest: CANNON.Body | null = null, distance = Infinity, total = 0
            for (const body of bodies.values()) {
                total += body.mass
                const away = Math.hypot(body.position.x - point.x, body.position.y - point.y, body.position.z - point.z)
                if (away < distance) {
                    nearest = body
                    distance = away
                }
            }
            for (const body of bodies.values()) {
                const share = 0.7 * body.mass / total
                body.applyImpulse(new CANNON.Vec3(impulse.x * share, impulse.y * share, impulse.z * share))
            }
            if (!nearest) return
            const local = Math.min(0.3, nearest.mass * LOCAL_KICK / Math.max(1e-6, impulse.length()))
            nearest.applyImpulse(new CANNON.Vec3(impulse.x * local, impulse.y * local, impulse.z * local), new CANNON.Vec3(point.x, point.y, point.z))
        },
        sever(limb, impulse) {
            if (severed.has(limb)) return null
            const part = LIMB_PART[limb]
            const constraint = constraints.get(part)
            const definition = LIMBS.find((candidate) => candidate.limb === limb)!
            const root = bones.get(definition.bone)
            if (!constraint || !root) return null
            severed.add(limb)
            physics.world.removeConstraint(constraint)
            // Tout ce qui descend de l'os coupé part avec lui, plus les os rattachés ailleurs (les pieds).
            const names = new Set<string>(definition.extra)
            root.traverse((object) => { if (object instanceof THREE.Bone) names.add(object.name) })
            cut(names)
            const joint = root.getWorldPosition(new THREE.Vector3())
            const axis = axes.get(part)!
            const definitionPart = PARTS.find((candidate) => candidate.part === part)!
            const radius = definitionPart.thickness[0] * scale * 0.55
            cap(root, joint, axis.clone().negate(), radius)
            const stump = cap(root.parent!, joint, axis, radius)
            // Le membre part dans le sens du coup et un peu vers le haut, à vitesse d'un objet lâché au bout d'un élan.
            const body = bodies.get(part)!
            const direction = impulse.clone().setY(0).normalize()
            body.wakeUp()
            body.applyImpulse(new CANNON.Vec3(direction.x * body.mass * SEVER_SPEED, body.mass * SEVER_SPEED, direction.z * body.mass * SEVER_SPEED))
            return stump
        },
        dispose() {
            for (const constraint of constraints.values()) physics.world.removeConstraint(constraint)
            for (const body of bodies.values()) physics.world.removeBody(body)
            ground.dispose()
            for (const disc of caps) {
                disc.removeFromParent()
                ;(disc as THREE.Mesh).geometry.dispose()
            }
            ownGeometries.forEach((geometry) => geometry.dispose())
        },
    }
}
