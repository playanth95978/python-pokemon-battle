/**
 * Kit d'espèces : chaque Pokémon du village est assemblé en code à partir de formes simples (ellipsoïdes, cônes,
 * cylindres), sans aucun modèle extrait des jeux. Ce sont des figurines stylisées, non officielles.
 * Toutes partagent un même squelette d'animation : pattes, bras, ailes, queue, tête et corps.
 *
 * Les formes d'une même pièce (tête, patte…) sont fusionnées en un seul maillage à couleurs de sommets, partagé par
 * tous les individus de l'espèce : un Pokémon coûte une dizaine d'appels de rendu au lieu d'une trentaine.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { PokemonPose, Species } from './villagePokemon'

export interface Rig {
    root: THREE.Group
    body: THREE.Group
    head: THREE.Group
    legs: THREE.Group[]
    arms: THREE.Group[]
    wings: THREE.Group[]
    tail: THREE.Group | null
    /** Caisse de Machoc, aura de Fantominus… : pièce montrée selon la pose. */
    extra: THREE.Object3D | null
}

const SPHERE = new THREE.SphereGeometry(1, 14, 10)
const CONE = new THREE.ConeGeometry(1, 1, 10)
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 10)
const materials = new Map<string, THREE.MeshStandardMaterial>()
/** Matériau partagé par couleur (et options) : quinze Pokémon n'en créent qu'une vingtaine. */
function paint(color: number, options: THREE.MeshStandardMaterialParameters = {}) {
    const key = `${color}-${JSON.stringify(options)}`
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({color, roughness: 0.55, ...options}))
    return materials.get(key)!
}

type Vec = [number, number, number]
function shape(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: number | THREE.Material, scale: Vec, position: Vec, rotation: Vec = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, typeof color === 'number' ? paint(color) : color)
    mesh.scale.set(...scale)
    mesh.position.set(...position)
    mesh.rotation.set(...rotation)
    mesh.castShadow = true
    parent.add(mesh)
    return mesh
}
const blob = (parent: THREE.Object3D, color: number | THREE.Material, scale: Vec, position: Vec, rotation?: Vec) => shape(parent, SPHERE, color, scale, position, rotation)
const cone = (parent: THREE.Object3D, color: number, scale: Vec, position: Vec, rotation?: Vec) => shape(parent, CONE, color, scale, position, rotation)
const rod = (parent: THREE.Object3D, color: number, scale: Vec, position: Vec, rotation?: Vec) => shape(parent, CYLINDER, color, scale, position, rotation)

function group(parent: THREE.Object3D, position: Vec) {
    const pivot = new THREE.Group()
    pivot.position.set(...position)
    parent.add(pivot)
    return pivot
}

/** Deux yeux sur la face avant (+z) de la tête : blanc, pupille, reflet. */
function eyes(head: THREE.Object3D, y: number, z: number, spread: number, size: number, iris = 0x1b1b22, white = true) {
    for (const side of [-1, 1]) {
        if (white) blob(head, 0xffffff, [size, size * 1.15, size * 0.5], [side * spread, y, z])
        blob(head, iris, [size * 0.6, size * 0.75, size * 0.4], [side * spread, y, z + size * 0.25])
        blob(head, 0xffffff, [size * 0.18, size * 0.18, size * 0.1], [side * spread + size * 0.15, y + size * 0.25, z + size * 0.45])
    }
}

function rig(): Rig {
    const root = new THREE.Group()
    const body = group(root, [0, 0, 0])
    return {root, body, head: group(body, [0, 0, 0]), legs: [], arms: [], wings: [], tail: null, extra: null}
}

/** Pattes d'un quadrupède : pivots aux hanches, la patte pend dessous. */
function fourLegs(r: Rig, color: number, width: number, front: number, back: number, hip: number, length: number, thickness: number) {
    for (const [x, z] of [[-width, front], [width, front], [-width, back], [width, back]]) {
        const leg = group(r.body, [x, hip, z])
        rod(leg, color, [thickness, length, thickness], [0, -length / 2, 0])
        r.legs.push(leg)
    }
}

const BUILDERS: Record<Species, () => Rig> = {
    machoc() {
        const r = rig(), skin = 0x8ea6bd, dark = 0x6f869c
        blob(r.body, skin, [0.2, 0.24, 0.16], [0, 0.45, 0])
        r.head.position.set(0, 0.74, 0)
        blob(r.head, skin, [0.17, 0.16, 0.15], [0, 0, 0])
        // Trois crêtes sur le crâne.
        for (const angle of [-0.45, 0, 0.45]) cone(r.head, dark, [0.035, 0.16 - Math.abs(angle) * 0.08, 0.06], [angle * 0.18, 0.18 - Math.abs(angle) * 0.04, -0.02], [0, 0, -angle])
        blob(r.head, 0xd9cdb5, [0.07, 0.04, 0.04], [0, -0.06, 0.13])
        eyes(r.head, 0.03, 0.12, 0.06, 0.035, 0xc22b2b)
        blob(r.head, dark, [0.13, 0.025, 0.03], [0, 0.07, 0.13])
        for (const side of [-1, 1]) {
            const arm = group(r.body, [side * 0.21, 0.6, 0])
            blob(arm, skin, [0.065, 0.15, 0.065], [0, -0.12, 0])
            blob(arm, skin, [0.07, 0.07, 0.07], [0, -0.27, 0.02])
            r.arms.push(arm)
            const leg = group(r.body, [side * 0.1, 0.26, 0])
            blob(leg, skin, [0.08, 0.13, 0.08], [0, -0.1, 0])
            blob(leg, skin, [0.08, 0.04, 0.11], [0, -0.23, 0.03])
            r.legs.push(leg)
        }
        // Caisse de minerai, portée au-dessus de la tête quand il travaille.
        const crate = new THREE.Group()
        shape(crate, new THREE.BoxGeometry(1, 1, 1), 0x8a5a36, [0.32, 0.22, 0.26], [0, 1.08, 0])
        blob(crate, 0x6a6e78, [0.1, 0.05, 0.08], [0.04, 1.2, 0])
        r.body.add(crate)
        r.extra = crate
        return r
    },
    wattouat() {
        const r = rig(), wool = 0xf4f0e3, skin = 0x8fc3e3
        for (const [x, y, z, size] of [[0, 0.4, 0, 0.19], [0.1, 0.42, 0.08, 0.13], [-0.1, 0.42, 0.08, 0.13], [0.1, 0.42, -0.1, 0.13],
            [-0.1, 0.42, -0.1, 0.13], [0, 0.52, 0, 0.13], [0, 0.36, -0.15, 0.12]]) blob(r.body, wool, [size, size, size], [x, y, z])
        fourLegs(r, skin, 0.08, 0.09, -0.1, 0.3, 0.26, 0.035)
        r.head.position.set(0, 0.5, 0.2)
        blob(r.head, skin, [0.12, 0.12, 0.12], [0, 0, 0.04])
        blob(r.head, wool, [0.07, 0.05, 0.06], [0, 0.11, 0.02])
        eyes(r.head, 0.02, 0.13, 0.05, 0.028)
        for (const side of [-1, 1]) {
            cone(r.head, 0xf0cf3a, [0.03, 0.12, 0.05], [side * 0.13, 0.04, 0], [0, 0, side * 1.6])
            rod(r.head, 0x1e1e22, [0.031, 0.02, 0.051], [side * 0.17, 0.04, 0], [0, 0, side * 1.6])
        }
        r.tail = group(r.body, [0, 0.42, -0.24])
        rod(r.tail, 0x1e1e22, [0.025, 0.2, 0.025], [0, 0, -0.08], [1.3, 0, 0])
        blob(r.tail, paint(0x5fb3ea, {emissive: 0x3f8ad0, emissiveIntensity: 0.5}), [0.06, 0.06, 0.06], [0, 0.04, -0.2])
        return r
    },
    caninos() {
        const r = rig(), fur = 0xe8853a, cream = 0xf3e1b2
        blob(r.body, fur, [0.15, 0.14, 0.28], [0, 0.38, 0])
        for (const z of [-0.12, 0, 0.12]) blob(r.body, 0x24201e, [0.155, 0.02, 0.03], [0, 0.48, z], [0, 0, 0])
        blob(r.body, cream, [0.13, 0.13, 0.1], [0, 0.42, 0.2])
        fourLegs(r, fur, 0.08, 0.15, -0.17, 0.32, 0.28, 0.04)
        r.head.position.set(0, 0.6, 0.27)
        blob(r.head, fur, [0.13, 0.12, 0.13], [0, 0, 0])
        blob(r.head, cream, [0.08, 0.05, 0.08], [0, 0.12, -0.02])
        blob(r.head, cream, [0.07, 0.05, 0.07], [0, -0.05, 0.11])
        blob(r.head, 0x1b1b22, [0.025, 0.02, 0.02], [0, -0.02, 0.18])
        eyes(r.head, 0.03, 0.11, 0.06, 0.03)
        for (const side of [-1, 1]) blob(r.head, fur, [0.04, 0.08, 0.03], [side * 0.11, 0.1, -0.02], [0, 0, side * 0.5])
        r.tail = group(r.body, [0, 0.45, -0.27])
        blob(r.tail, cream, [0.07, 0.07, 0.14], [0, 0.06, -0.08], [0.6, 0, 0])
        return r
    },
    evoli() {
        const r = rig(), fur = 0x9c6a3a, cream = 0xf3e2c2
        blob(r.body, fur, [0.11, 0.1, 0.17], [0, 0.26, 0])
        for (let index = 0; index < 7; index++) {
            const angle = (index / 7) * Math.PI * 2
            blob(r.body, cream, [0.06, 0.06, 0.06], [Math.cos(angle) * 0.09, 0.33 + Math.sin(angle) * 0.04, 0.12 + Math.sin(angle) * 0.02])
        }
        fourLegs(r, fur, 0.06, 0.1, -0.1, 0.2, 0.2, 0.03)
        r.head.position.set(0, 0.42, 0.16)
        blob(r.head, fur, [0.11, 0.1, 0.1], [0, 0, 0])
        eyes(r.head, 0.01, 0.09, 0.045, 0.03, 0x3a2414)
        blob(r.head, 0x1b1b22, [0.015, 0.012, 0.01], [0, -0.03, 0.1])
        for (const side of [-1, 1]) {
            cone(r.head, fur, [0.06, 0.22, 0.03], [side * 0.09, 0.17, -0.01], [0, 0, -side * 0.35])
            cone(r.head, 0x3a2414, [0.03, 0.12, 0.01], [side * 0.11, 0.21, 0.01], [0, 0, -side * 0.35])
        }
        r.tail = group(r.body, [0, 0.3, -0.16])
        blob(r.tail, fur, [0.08, 0.12, 0.07], [0, 0.1, -0.04], [-0.4, 0, 0])
        blob(r.tail, cream, [0.06, 0.06, 0.05], [0, 0.21, -0.08])
        return r
    },
    ronflex() {
        const r = rig(), fur = 0x2f5e6c, cream = 0xeedfbf
        blob(r.body, fur, [0.72, 0.75, 0.62], [0, 0.78, 0])
        blob(r.body, cream, [0.6, 0.6, 0.36], [0, 0.72, 0.32])
        r.head.position.set(0, 1.52, 0.05)
        blob(r.head, fur, [0.42, 0.33, 0.36], [0, 0, 0])
        blob(r.head, cream, [0.34, 0.25, 0.2], [0, -0.04, 0.2])
        for (const side of [-1, 1]) {
            cone(r.head, fur, [0.08, 0.14, 0.06], [side * 0.27, 0.3, 0], [0, 0, -side * 0.3])
            // Yeux fermés : deux traits.
            shape(r.head, new THREE.BoxGeometry(1, 1, 1), 0x1b1b22, [0.1, 0.015, 0.02], [side * 0.11, 0.04, 0.38])
            blob(r.head, 0xffffff, [0.03, 0.04, 0.02], [side * 0.08, -0.12, 0.38])
            const arm = group(r.body, [side * 0.68, 1.0, 0.05])
            blob(arm, fur, [0.16, 0.32, 0.16], [side * 0.05, -0.22, 0.05], [0, 0, side * 0.35])
            r.arms.push(arm)
            const foot = group(r.body, [side * 0.38, 0.18, 0.5])
            blob(foot, cream, [0.2, 0.22, 0.12], [0, 0, 0])
            for (const claw of [-1, 0, 1]) cone(foot, 0xffffff, [0.03, 0.06, 0.03], [claw * 0.08, 0.2, 0.04])
            r.legs.push(foot)
        }
        blob(r.head, 0x1b1b22, [0.14, 0.03, 0.02], [0, -0.08, 0.37])
        return r
    },
    roucool() {
        const r = rig(), plumage = 0xa47444, cream = 0xf1dcb2
        blob(r.body, plumage, [0.12, 0.12, 0.15], [0, 0.17, 0])
        blob(r.body, cream, [0.09, 0.1, 0.06], [0, 0.15, 0.09])
        r.head.position.set(0, 0.32, 0.06)
        blob(r.head, plumage, [0.09, 0.09, 0.09], [0, 0, 0])
        blob(r.head, cream, [0.07, 0.05, 0.05], [0, -0.02, 0.05])
        cone(r.head, 0x3a3a40, [0.025, 0.06, 0.025], [0, -0.01, 0.1], [Math.PI / 2, 0, 0])
        for (const side of [-1, 1]) {
            blob(r.head, 0x1b1b22, [0.035, 0.012, 0.02], [side * 0.05, 0.02, 0.07], [0, side * 0.4, 0])
            const wing = group(r.body, [side * 0.1, 0.2, 0])
            blob(wing, plumage, [0.03, 0.08, 0.13], [side * 0.04, -0.02, -0.02])
            r.wings.push(wing)
            const leg = group(r.body, [side * 0.04, 0.06, 0.02])
            rod(leg, 0xe0a0a0, [0.012, 0.06, 0.012], [0, -0.03, 0])
            r.legs.push(leg)
        }
        cone(r.head, plumage, [0.03, 0.08, 0.02], [0, 0.1, -0.02], [-0.5, 0, 0])
        r.tail = group(r.body, [0, 0.16, -0.14])
        blob(r.tail, 0x6a4524, [0.06, 0.02, 0.08], [0, 0, -0.04], [-0.3, 0, 0])
        return r
    },
    magicarpe() {
        const r = rig(), scales = 0xe2532e, fin = 0xf3e09a
        blob(r.body, scales, [0.09, 0.2, 0.26], [0, 0, 0])
        blob(r.body, 0xf4f0e8, [0.07, 0.07, 0.06], [0, -0.07, 0.22])
        eyes(r.body, 0.05, 0.17, 0.07, 0.04)
        for (let index = 0; index < 3; index++) cone(r.body, fin, [0.02, 0.14, 0.06], [0, 0.22, 0.1 - index * 0.1], [-0.3, 0, 0])
        for (const side of [-1, 1]) {
            rod(r.body, fin, [0.008, 0.18, 0.008], [side * 0.08, -0.06, 0.28], [0.9, 0, side * 0.6])
            blob(r.body, fin, [0.02, 0.07, 0.05], [side * 0.08, -0.1, 0.05], [0, 0, side * 0.5])
        }
        r.tail = group(r.body, [0, 0, -0.24])
        blob(r.tail, fin, [0.02, 0.15, 0.1], [0, 0, -0.08])
        return r
    },
    fantominus() {
        const r = rig()
        r.body.position.y = 0
        blob(r.body, paint(0x2a1838, {emissive: 0x1a0828, emissiveIntensity: 0.6}), [0.2, 0.2, 0.2], [0, 0, 0])
        const aura = new THREE.Group()
        const gas = paint(0x8a4bb5, {transparent: true, opacity: 0.35, emissive: 0x5a2a80, emissiveIntensity: 0.8, depthWrite: false})
        blob(aura, gas, [0.34, 0.32, 0.34], [0, 0, 0])
        for (let index = 0; index < 6; index++) {
            const angle = index / 6 * Math.PI * 2
            blob(aura, gas, [0.14, 0.12, 0.14], [Math.cos(angle) * 0.3, Math.sin(angle * 2) * 0.08, Math.sin(angle) * 0.3])
        }
        aura.traverse((object) => { object.castShadow = false })
        r.body.add(aura)
        r.extra = aura
        const glow = paint(0xffffff, {emissive: 0xffffff, emissiveIntensity: 0.9})
        for (const side of [-1, 1]) {
            blob(r.body, glow, [0.06, 0.05, 0.03], [side * 0.08, 0.06, 0.17], [0, 0, -side * 0.3])
            blob(r.body, 0x111111, [0.025, 0.025, 0.02], [side * 0.07, 0.05, 0.195])
            cone(r.body, 0xffffff, [0.015, 0.04, 0.015], [side * 0.05, -0.07, 0.185], [Math.PI, 0, 0])
        }
        blob(r.body, glow, [0.11, 0.035, 0.02], [0, -0.06, 0.18])
        return r
    },
}

const vertexColors = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.55})
/** Géométries fusionnées, par espèce et par pièce : construites au premier individu, partagées ensuite. */
const baked = new Map<string, THREE.BufferGeometry | null>()

/** Fond les formes opaques posées directement dans `part` en un maillage ; les matériaux spéciaux (lueur, gaz) restent à part. */
function bake(part: THREE.Object3D, key: string) {
    const plain = part.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh
        && !(child.material as THREE.MeshStandardMaterial).transparent && (child.material as THREE.MeshStandardMaterial).emissive.getHex() === 0)
    if (!plain.length) return
    if (!baked.has(key)) {
        baked.set(key, mergeGeometries(plain.map((mesh) => {
            mesh.updateMatrix()
            const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix)
            const color = (mesh.material as THREE.MeshStandardMaterial).color
            const colors = new Float32Array(geometry.attributes.position.count * 3)
            for (let index = 0; index < colors.length; index += 3) colors.set([color.r, color.g, color.b], index)
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
            return geometry
        })))
    }
    const geometry = baked.get(key)
    if (!geometry) return
    plain.forEach((mesh) => part.remove(mesh))
    const merged = new THREE.Mesh(geometry, vertexColors)
    merged.castShadow = true
    part.add(merged)
}

export function buildPokemon(species: Species): Rig {
    const r = BUILDERS[species]()
    const parts = [r.body, r.head, ...r.legs, ...r.arms, ...r.wings, r.tail, r.extra].filter((part): part is THREE.Object3D => part !== null)
    parts.forEach((part, index) => bake(part, `${species}:${index}`))
    return r
}

/** Anime la figurine selon sa pose ; `time` en secondes, `phase` décale chaque individu. */
export function animatePokemon(r: Rig, species: Species, pose: PokemonPose, time: number, phase: number) {
    const t = time + phase
    const moving = pose === 'walk' || pose === 'run' || pose === 'carry'
    const speed = pose === 'run' ? 14 : 8
    const swing = moving ? Math.sin(t * speed) * (pose === 'run' ? 0.8 : 0.5) : 0
    r.legs.forEach((leg, index) => { leg.rotation.x = species === 'ronflex' ? 0 : swing * (index % 2 ? 1 : -1) * (index >= 2 && r.legs.length === 4 ? -1 : 1) })
    r.body.position.y = moving ? Math.abs(Math.sin(t * speed)) * 0.03 : 0
    r.body.scale.setScalar(1)
    r.head.rotation.set(0, 0, 0)
    if (r.tail) r.tail.rotation.y = Math.sin(t * (moving ? 12 : 3)) * (species === 'caninos' ? 0.6 : 0.25)
    // Bras : balancier en marchant, levés pour porter la caisse.
    r.arms.forEach((arm, index) => {
        const side = index ? 1 : -1
        arm.rotation.set(pose === 'carry' ? Math.PI : -swing * side, 0, pose === 'carry' ? -side * 0.25 : 0)
    })
    if (r.extra && species === 'machoc') r.extra.visible = pose === 'carry'
    switch (pose) {
        case 'eat':
            r.head.rotation.x = 0.6 + Math.sin(t * 4) * 0.12
            break
        case 'sleep':
            // Respiration lente ; les quadrupèdes se couchent.
            r.body.scale.set(1, 1 + Math.sin(t * 1.4) * 0.03, 1)
            if (r.legs.length === 4) r.body.position.y = -0.14
            r.head.rotation.x = species === 'ronflex' ? 0.15 : 0.4
            break
        case 'idle':
            r.head.rotation.y = Math.sin(t * 0.7) * 0.35
            if (species === 'roucool') r.head.rotation.x = Math.max(0, Math.sin(t * 2.3)) * 0.5
            break
        case 'float':
            r.body.position.y = Math.sin(t * 2) * 0.08
            break
    }
    // Ailes repliées au repos, battements en vol.
    const flap = pose === 'fly' ? Math.sin(t * 22) * 1.1 : 0
    r.wings.forEach((wing, index) => { wing.rotation.z = (index ? -1 : 1) * (pose === 'fly' ? 0.4 + flap : 0) })
    if (r.extra && species === 'fantominus') {
        r.extra.rotation.y = t * 0.8
        r.extra.scale.setScalar(1 + Math.sin(t * 3) * 0.06)
    }
}
