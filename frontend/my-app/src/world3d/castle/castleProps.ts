/**
 * Mobilier du château, construit en code avec les matériaux 2K. Chaque meuble est centré sur l'origine, au sol,
 * et occupe `width` × `depth` cases ; son « avant » regarde +z. Les flammes portent `userData.flame` (scintillement)
 * et les sources de lumière `userData.light` (intensité, couleur) : l'intérieur leur attribue des lumières réelles.
 */
import * as THREE from 'three'
import type { CastleMaterials } from './castleMaterials'
import { TEXTURE_SIZE, texturedBox, texturedCylinder } from './castleMaterials'
import type { PropKind } from './castleLayout'

export const WALL_HEIGHT = 3.6

function canvasTexture(size: number, draw: (context: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    draw(canvas.getContext('2d')!)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

/** Flamme peinte : goutte effilée, cœur presque blanc, bords orangés qui s'estompent. */
const flameTexture = canvasTexture(128, (context) => {
    const drop = (width: number, top: number, bottom: number) => {
        context.beginPath()
        context.moveTo(64, top)
        context.bezierCurveTo(64 + width * 0.35, top + 30, 64 + width, bottom - 34, 64, bottom)
        context.bezierCurveTo(64 - width, bottom - 34, 64 - width * 0.35, top + 30, 64, top)
        context.fill()
    }
    context.filter = 'blur(4px)'
    context.fillStyle = 'rgba(255, 90, 20, 0.55)'
    drop(34, 6, 122)
    context.fillStyle = 'rgba(255, 170, 50, 0.9)'
    drop(24, 26, 118)
    context.fillStyle = 'rgba(255, 245, 210, 1)'
    drop(12, 60, 112)
})
/** Halo rond et doux autour de la flamme. */
const glowTexture = canvasTexture(64, (context) => {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255, 200, 120, 0.75)')
    gradient.addColorStop(0.4, 'rgba(255, 140, 50, 0.25)')
    gradient.addColorStop(1, 'rgba(255, 100, 30, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
})
// Couleur au-delà de 1 : le tone mapping rend la flamme éclatante sans la brûler en blanc.
const flameMaterial = new THREE.SpriteMaterial({map: flameTexture, color: new THREE.Color(1.8, 1.5, 1.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true})
const glowMaterial = new THREE.SpriteMaterial({map: glowTexture, color: new THREE.Color(1.2, 1, 0.9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true})

/**
 * Flamme : sprite peint toujours tourné vers la caméra, halo, et point d'ancrage de lumière.
 * `scale` = 1 pour une torche (flamme d'environ 30 cm).
 */
export function flame(scale = 1, light = 4) {
    const group = new THREE.Group()
    const fire = new THREE.Sprite(flameMaterial)
    fire.scale.set(0.16, 0.3, 1)
    fire.position.y = 0.13
    const glow = new THREE.Sprite(glowMaterial)
    glow.scale.setScalar(0.85)
    glow.position.y = 0.12
    group.add(glow, fire)
    group.scale.setScalar(scale)
    group.userData.flame = true
    group.userData.light = {intensity: light, color: 0xff9a45}
    return group
}

/** Lustre de fer forgé : couronne, chaînes et six bougies, suspendu au plafond. */
export function chandelier(materials: CastleMaterials) {
    const result = new THREE.Group()
    const ring = mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 32).rotateX(Math.PI / 2), materials.iron)
    const inner = mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 20).rotateX(Math.PI / 2), materials.iron)
    result.add(ring, inner)
    for (let index = 0; index < 4; index++) {
        const angle = index / 4 * Math.PI * 2
        const chain = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4), materials.iron, Math.cos(angle) * 0.27, 0.53, Math.sin(angle) * 0.27)
        chain.rotation.set(Math.sin(angle) * 0.47, 0, -Math.cos(angle) * 0.47)
        result.add(chain)
    }
    for (let index = 0; index < 6; index++) {
        const angle = index / 6 * Math.PI * 2
        result.add(candle(materials, Math.cos(angle) * 0.55, 0.02, Math.sin(angle) * 0.55, false))
    }
    result.traverse((object) => { object.castShadow = false })
    return result
}

type Builder = (materials: CastleMaterials, width: number, depth: number) => THREE.Object3D

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
    const part = new THREE.Mesh(geometry, material)
    part.position.set(x, y, z)
    part.castShadow = true
    part.receiveShadow = true
    return part
}

function group(...children: THREE.Object3D[]) {
    const result = new THREE.Group()
    result.add(...children)
    return result
}

const wood = (m: CastleMaterials, w: number, h: number, d: number, x = 0, y = 0, z = 0) => mesh(texturedBox(w, h, d, TEXTURE_SIZE.wood), m.wood, x, y, z)

/** Pied de table ou de meuble : quatre montants aux coins. */
function legs(m: CastleMaterials, width: number, depth: number, height: number, thickness = 0.08) {
    return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) =>
        wood(m, thickness, height, thickness, sx * (width / 2 - thickness), height / 2, sz * (depth / 2 - thickness)))
}

/** Acier des armures : clair et réfléchissant, il renvoie les flammes et les fenêtres. */
const polishedSteel = new THREE.MeshStandardMaterial({color: 0xb9c0c8, metalness: 1, roughness: 0.28})
const wax = new THREE.MeshStandardMaterial({color: 0xf3ead2, roughness: 0.45, emissive: 0x6b3a10, emissiveIntensity: 0.25})
const wick = new THREE.MeshBasicMaterial({color: 0x1a1208})

/** Bougie : bougeoir à coupelle, cire avec coulure, mèche et petite flamme (qui éclaire si `lit`). */
function candle(m: CastleMaterials, x: number, y: number, z: number, lit = true) {
    const parts = [
        mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 14), m.gold, x, y + 0.012, z),
        mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.06, 8), m.gold, x, y + 0.05, z),
        mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.02, 12), m.gold, x, y + 0.085, z),
        mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.17, 12), wax, x, y + 0.18, z),
        mesh(new THREE.SphereGeometry(0.012, 6, 4).scale(1, 2.2, 1), wax, x + 0.026, y + 0.22, z),
        mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.025, 4), wick, x, y + 0.275, z),
    ]
    const fire = flame(0.32, lit ? 0.9 : 0)
    fire.position.set(x, y + 0.27, z)
    if (!lit) delete fire.userData.light
    return group(...parts, fire)
}

const BUILDERS: Record<PropKind, Builder> = {
    pillar: (m) => group(
        mesh(texturedCylinder(0.3, 0.3, WALL_HEIGHT - 0.5, 20, TEXTURE_SIZE.brick), m.brick, 0, WALL_HEIGHT / 2, 0),
        mesh(texturedBox(0.85, 0.25, 0.85, TEXTURE_SIZE.stoneFloor), m.stoneFloor, 0, 0.125, 0),
        mesh(texturedBox(0.85, 0.25, 0.85, TEXTURE_SIZE.stoneFloor), m.stoneFloor, 0, WALL_HEIGHT - 0.125, 0),
    ),
    armorStand: (m) => {
        // Armure complète d'acier poli sur socle de bois, lance à la main.
        const steel = polishedSteel
        const parts = [
            wood(m, 0.7, 0.12, 0.6, 0, 0.06, 0),
            ...[-0.11, 0.11].map((x) => mesh(new THREE.CapsuleGeometry(0.07, 0.6, 4, 10), steel, x, 0.52, 0)),
            mesh(new THREE.CapsuleGeometry(0.2, 0.32, 6, 14).scale(1.1, 1, 0.75), steel, 0, 1.17, 0),
            ...[-0.3, 0.3].map((x) => mesh(new THREE.SphereGeometry(0.11, 14, 10), steel, x, 1.36, 0)),
            ...[-0.31, 0.31].map((x) => mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), steel, x, 1.05, 0.03)),
            mesh(new THREE.SphereGeometry(0.15, 16, 12).scale(1, 1.15, 1), steel, 0, 1.66, 0),
            mesh(new THREE.BoxGeometry(0.2, 0.03, 0.04), new THREE.MeshStandardMaterial({color: 0x050505}), 0, 1.67, 0.14),
            mesh(new THREE.ConeGeometry(0.04, 0.22, 6), m.velvet, 0, 1.88, -0.02),
            mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.1, 6), m.wood, 0.42, 1.05, 0.08),
            mesh(new THREE.ConeGeometry(0.05, 0.25, 4), steel, 0.42, 2.2, 0.08),
        ]
        return group(...parts)
    },
    weaponRack: (m, width) => {
        const length = width
        const parts: THREE.Object3D[] = [
            wood(m, length, 0.08, 0.3, 0, 0.35, 0), wood(m, length, 0.08, 0.3, 0, 1.6, 0),
            ...[-1, 1].map((side) => wood(m, 0.1, 1.8, 0.3, side * (length / 2 - 0.05), 0.9, 0)),
        ]
        for (let index = 0; index < length * 2; index++) {
            const x = -length / 2 + 0.35 + index * 0.45
            parts.push(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 6), m.wood, x, 1, 0.05), mesh(new THREE.ConeGeometry(0.045, 0.22, 4), m.iron, x, 2.05, 0.05))
        }
        // Bouclier au blason pourpre et or.
        const shield = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 24).rotateX(Math.PI / 2), m.velvet, 0, 1.15, 0.2)
        shield.add(mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 24), m.gold), mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 16), m.gold, 0, 0, 0.03))
        parts.push(shield)
        return group(...parts)
    },
    table: (m, width, depth) => group(
        wood(m, width - 0.15, 0.07, depth - 0.25, 0, 0.78, 0), ...legs(m, width - 0.2, depth - 0.3, 0.75),
        candle(m, -0.3, 0.815, 0), mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.03, 18), m.iron, 0.3, 0.83, 0.05),
    ),
    longTable: (m, width, depth) => {
        const parts: THREE.Object3D[] = [wood(m, width - 0.1, 0.08, depth + 0.1, 0, 0.8, 0), ...legs(m, width - 0.2, depth, 0.76, 0.1)]
        // Couverts, gobelets d'or, miches de pain et chandelles le long de la table.
        for (let index = 0; index < width; index++) {
            const x = -width / 2 + 0.5 + index
            parts.push(
                mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.025, 18), m.iron, x - 0.15, 0.85, 0.3),
                mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.025, 18), m.iron, x + 0.15, 0.85, -0.3),
                mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.14, 10), m.gold, x + 0.25, 0.91, 0.25),
                mesh(new THREE.SphereGeometry(0.11, 12, 8).scale(1.4, 0.6, 1), new THREE.MeshStandardMaterial({color: 0xb07a3c, roughness: 0.8}), x - 0.1, 0.89, 0),
            )
            if (index % 2 === 0) parts.push(candle(m, x + 0.1, 0.84, -0.05))
        }
        return group(...parts)
    },
    barrel: (m) => {
        const profile = Array.from({length: 9}, (_, index) => {
            const t = index / 8
            return new THREE.Vector2(0.3 + Math.sin(t * Math.PI) * 0.06, t * 0.9)
        })
        const staves = new THREE.LatheGeometry(profile, 18)
        const uvs = staves.attributes.uv
        for (let index = 0; index < uvs.count; index++) uvs.setXY(index, uvs.getX(index) * 1.4, uvs.getY(index) * 0.6)
        return group(
            mesh(staves, m.wood),
            mesh(new THREE.CircleGeometry(0.3, 18).rotateX(-Math.PI / 2), m.wood, 0, 0.9, 0),
            ...[0.12, 0.45, 0.78].map((y) => mesh(new THREE.TorusGeometry(0.33 + Math.sin((y / 0.9) * Math.PI) * 0.05, 0.015, 6, 24).rotateX(Math.PI / 2), m.iron, 0, y, 0)),
        )
    },
    hearth: (m, width) => {
        const stone = (w: number, h: number, d: number, x: number, y: number, z: number) => mesh(texturedBox(w, h, d, TEXTURE_SIZE.brick), m.brick, x, y, z)
        const fire = flame(1.8, 14)
        fire.position.set(0, 0.25, -0.05)
        const logs = [-0.2, 0.2].map((x) => mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 8).rotateZ(Math.PI / 2).rotateY(x), m.wood, x * 0.5, 0.12, 0))
        return group(
            stone(0.45, 2.1, 0.9, -width / 2 + 0.22, 1.05, 0), stone(0.45, 2.1, 0.9, width / 2 - 0.22, 1.05, 0),
            stone(width, 0.5, 1, 0, 2.3, 0), stone(width + 0.2, 0.12, 1.1, 0, 2.6, 0),
            stone(width - 0.9, 2.1, 0.15, 0, 1.05, -0.4), mesh(texturedBox(width - 0.9, 0.06, 0.8, TEXTURE_SIZE.stoneFloor), m.stoneFloor, 0, 0.03, 0),
            mesh(new THREE.BoxGeometry(width + 0.4, 1, 0.8), m.brick, 0, 3.1, -0.05),
            ...logs, fire,
        )
    },
    shelf: (m) => {
        const parts: THREE.Object3D[] = [
            wood(m, 0.96, 2.7, 0.08, 0, 1.35, -0.32),
            ...[-1, 1].map((side) => wood(m, 0.06, 2.7, 0.42, side * 0.45, 1.35, -0.13)),
            ...[0.05, 0.7, 1.35, 2.0, 2.66].map((y) => wood(m, 0.92, 0.05, 0.42, 0, y, -0.13)),
        ]
        // Rangées de livres de couleurs, hauteurs et inclinaisons variées.
        const book = new THREE.BoxGeometry(1, 1, 1)
        const colors = [0x6b1d1d, 0x1f3b5a, 0x2e4a24, 0x5a3b1a, 0x3d2a52, 0x7a5c1e, 0x26262a]
        let seed = 17
        const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
        const books = new THREE.InstancedMesh(book, new THREE.MeshStandardMaterial({roughness: 0.7}), 4 * 14)
        const matrix = new THREE.Matrix4(), color = new THREE.Color()
        let count = 0
        for (const y of [0.08, 0.73, 1.38, 2.03]) {
            let x = -0.42
            while (x < 0.38 && count < 4 * 14) {
                const thickness = 0.04 + random() * 0.035, height = 0.42 + random() * 0.15
                const tilt = random() < 0.1 ? 0.25 : 0
                matrix.compose(new THREE.Vector3(x + thickness / 2, y + height / 2, -0.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt)), new THREE.Vector3(thickness, height, 0.3))
                books.setMatrixAt(count, matrix)
                books.setColorAt(count, color.setHex(colors[Math.floor(random() * colors.length)]).multiplyScalar(0.8 + random() * 0.4))
                x += thickness + 0.004
                count++
            }
        }
        books.count = count
        books.castShadow = true
        parts.push(books)
        return group(...parts)
    },
    desk: (m, width) => group(
        wood(m, width - 0.2, 0.07, 0.75, 0, 0.78, 0), ...legs(m, width - 0.25, 0.7, 0.75),
        mesh(new THREE.BoxGeometry(0.45, 0.04, 0.32).rotateY(0.2), new THREE.MeshStandardMaterial({color: 0xe8dcc0, roughness: 0.9}), -0.2, 0.84, 0),
        mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12), new THREE.MeshStandardMaterial({color: 0x101018, roughness: 0.2}), 0.3, 0.86, -0.15),
        candle(m, 0.45, 0.815, 0.15),
    ),
    altar: (m, width) => group(
        mesh(texturedBox(width - 0.4, 1, 0.9, TEXTURE_SIZE.marble), m.marble, 0, 0.5, 0),
        mesh(texturedBox(width - 0.3, 0.04, 0.95, TEXTURE_SIZE.velvet), m.velvet, 0, 1.02, 0.02),
        mesh(texturedBox(0.5, 0.6, 0.02, TEXTURE_SIZE.velvet), m.velvet, 0, 0.7, 0.47),
        ...[-0.9, 0.9].map((x) => candle(m, x, 1.04, 0)),
        mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 24), m.gold, 0, 1.4, -0.2),
    ),
    pew: (m, width) => group(
        wood(m, width - 0.1, 0.06, 0.4, 0, 0.45, 0), wood(m, width - 0.1, 0.6, 0.05, 0, 0.8, 0.2),
        ...[-1, 1].map((side) => wood(m, 0.06, 0.95, 0.5, side * (width / 2 - 0.08), 0.47, 0.03)),
    ),
    bed: (m, width, depth) => {
        const parts: THREE.Object3D[] = [
            wood(m, width - 0.1, 0.35, depth - 0.1, 0, 0.3, 0),
            mesh(texturedBox(width - 0.2, 0.22, depth - 0.3, TEXTURE_SIZE.velvet), new THREE.MeshStandardMaterial({color: 0xe9e3d6, roughness: 0.95}), 0, 0.58, 0.05),
            mesh(texturedBox(width - 0.15, 0.06, depth * 0.62, TEXTURE_SIZE.velvet), m.velvet, 0, 0.71, depth * 0.17),
            ...[-0.42, 0.42].map((x) => mesh(new THREE.CapsuleGeometry(0.12, 0.35, 4, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({color: 0xf4f0e6, roughness: 0.95}), x, 0.76, -depth / 2 + 0.4)),
            wood(m, width - 0.1, 1.3, 0.1, 0, 0.95, -depth / 2 + 0.05),
        ]
        // Baldaquin : quatre colonnes et un ciel de lit en velours.
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            parts.push(mesh(texturedCylinder(0.05, 0.05, 2.4, 10, TEXTURE_SIZE.wood), m.wood, sx * (width / 2 - 0.08), 1.2, sz * (depth / 2 - 0.08)))
        }
        parts.push(mesh(texturedBox(width, 0.12, depth, TEXTURE_SIZE.velvet), m.velvet, 0, 2.42, 0))
        for (const side of [-1, 1]) parts.push(mesh(texturedBox(0.04, 1.6, depth - 0.2, TEXTURE_SIZE.velvet), m.velvet, side * (width / 2 - 0.02), 1.6, 0))
        return group(...parts)
    },
    wardrobe: (m) => group(
        wood(m, 0.95, 2.3, 0.6, 0, 1.15, -0.18), wood(m, 0.02, 2.1, 0.02, 0, 1.15, 0.13),
        ...[-0.08, 0.08].map((x) => mesh(new THREE.SphereGeometry(0.03, 10, 8), m.gold, x, 1.2, 0.14)),
        wood(m, 1.02, 0.1, 0.66, 0, 2.33, -0.18),
    ),
    statue: (m) => {
        // Grande urne de marbre à anses dorées sur un piédestal mouluré.
        const marble = m.marble
        const profile = [[0, 0], [0.2, 0], [0.22, 0.04], [0.14, 0.1], [0.12, 0.18], [0.24, 0.32], [0.33, 0.5], [0.34, 0.62],
            [0.28, 0.78], [0.17, 0.9], [0.15, 0.98], [0.22, 1.04], [0.22, 1.08], [0, 1.08]].map(([x, y]) => new THREE.Vector2(x, y))
        const urn = new THREE.LatheGeometry(profile, 32)
        const uvs = urn.attributes.uv
        for (let index = 0; index < uvs.count; index++) uvs.setXY(index, uvs.getX(index) * 0.7, uvs.getY(index) * 0.5)
        return group(
            mesh(texturedBox(0.62, 0.9, 0.62, TEXTURE_SIZE.marble), marble, 0, 0.55, 0),
            mesh(texturedBox(0.78, 0.1, 0.78, TEXTURE_SIZE.marble), marble, 0, 0.05, 0),
            mesh(texturedBox(0.74, 0.08, 0.74, TEXTURE_SIZE.marble), marble, 0, 1.04, 0),
            mesh(new THREE.BoxGeometry(0.64, 0.05, 0.64), m.gold, 0, 0.98, 0),
            mesh(urn, marble, 0, 1.08, 0),
            ...[-1, 1].map((side) => mesh(new THREE.TorusGeometry(0.12, 0.022, 8, 20, Math.PI).rotateZ(side * Math.PI / 2), m.gold, side * 0.32, 1.78, 0)),
        )
    },
    chest: (m) => {
        const lid = new THREE.Group()
        lid.position.set(0, 0.48, -0.25)
        lid.rotation.x = -0.9
        lid.add(wood(m, 0.8, 0.12, 0.5, 0, 0.06, 0.25), mesh(new THREE.BoxGeometry(0.82, 0.03, 0.06), m.gold, 0, 0.12, 0.48))
        const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 12), m.gold, 60)
        const matrix = new THREE.Matrix4()
        for (let index = 0; index < 60; index++) {
            matrix.compose(new THREE.Vector3(Math.sin(index * 2.3) * 0.32, 0.46 + (index % 5) * 0.012, Math.cos(index * 1.7) * 0.18),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(index) * 0.4, index, Math.cos(index) * 0.4)), new THREE.Vector3(1, 1, 1))
            coins.setMatrixAt(index, matrix)
        }
        const shine = new THREE.Object3D()
        shine.position.y = 0.7
        shine.userData.light = {intensity: 0.8, color: 0xffcf6a}
        return group(
            wood(m, 0.8, 0.48, 0.5, 0, 0.24, 0),
            ...[-0.3, 0.3].map((x) => mesh(new THREE.BoxGeometry(0.05, 0.5, 0.52), m.gold, x, 0.25, 0)),
            coins, lid, shine,
        )
    },
    brazier: (m) => {
        // Feu de brasero : grandes flammes qui débordent de la vasque.
        const fire = flame(2.8, 8)
        fire.position.y = 1.05
        return group(
            ...[0, 1, 2].map((index) => {
                const angle = index / 3 * Math.PI * 2
                return mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 6).rotateZ(0.2).rotateY(angle), m.iron, Math.cos(angle) * 0.15, 0.55, Math.sin(angle) * 0.15)
            }),
            mesh(new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.iron, 0, 1.15, 0),
            mesh(new THREE.CircleGeometry(0.27, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: new THREE.Color(3, 0.8, 0.2)}), 0, 1.13, 0),
            fire,
        )
    },
    throne: (m, width) => group(
        mesh(texturedBox(width + 1.2, 0.2, 2.4, TEXTURE_SIZE.marble), m.marble, 0, 0.1, 0.4),
        mesh(texturedBox(width + 0.6, 0.2, 1.8, TEXTURE_SIZE.marble), m.marble, 0, 0.3, 0.25),
        mesh(texturedBox(1.1, 0.5, 0.9, TEXTURE_SIZE.velvet), m.velvet, 0, 0.65, 0.1),
        mesh(texturedBox(1.2, 2.3, 0.2, TEXTURE_SIZE.velvet), m.velvet, 0, 1.55, -0.38),
        ...[-1, 1].map((side) => mesh(new THREE.BoxGeometry(0.12, 2.6, 0.24), m.gold, side * 0.62, 1.6, -0.38)),
        ...[-1, 1].map((side) => mesh(new THREE.BoxGeometry(0.14, 0.12, 0.9), m.gold, side * 0.62, 1.0, 0.1)),
        mesh(new THREE.TorusGeometry(0.3, 0.05, 10, 24), m.gold, 0, 2.95, -0.38),
        mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshStandardMaterial({color: 0x9b4dff, emissive: 0x6a1fd0, emissiveIntensity: 2}), 0, 2.95, -0.38),
    ),
}

export function buildProp(kind: PropKind, materials: CastleMaterials, width = 1, depth = 1) {
    return BUILDERS[kind](materials, width, depth)
}

/** Torche murale : support de fer, manche de bois et flamme, plaquée contre un mur (le mur est derrière, en −z). */
export function wallTorch(materials: CastleMaterials) {
    // Platine de fer rivetée, bras coudé, corbeille ajourée qui tient le flambeau de bois.
    const fire = flame(1.1, 5)
    fire.position.set(0, 0.42, 0.22)
    const basket = new THREE.Group()
    basket.position.set(0, 0.24, 0.22)
    for (let index = 0; index < 6; index++) {
        const angle = index / 6 * Math.PI * 2
        const bar = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), materials.iron, Math.cos(angle) * 0.055, 0.06, Math.sin(angle) * 0.055)
        bar.rotation.set(Math.sin(angle) * -0.35, 0, Math.cos(angle) * 0.35)
        basket.add(bar)
    }
    basket.add(mesh(new THREE.TorusGeometry(0.085, 0.01, 6, 16).rotateX(Math.PI / 2), materials.iron, 0, 0.13, 0))
    basket.add(mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 12).rotateX(Math.PI / 2), materials.iron, 0, -0.01, 0))
    const ember = mesh(new THREE.SphereGeometry(0.06, 10, 8).scale(1, 0.6, 1), new THREE.MeshBasicMaterial({color: new THREE.Color(2.2, 0.7, 0.15)}), 0, 0.12, 0)
    basket.add(ember)
    return group(
        mesh(new THREE.BoxGeometry(0.14, 0.3, 0.025), materials.iron, 0, 0.05, 0.012),
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => mesh(new THREE.SphereGeometry(0.012, 6, 4), materials.iron, sx * 0.045, 0.05 + sy * 0.11, 0.028))),
        mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 6).rotateX(Math.PI / 2), materials.iron, 0, 0.05, 0.13),
        mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), materials.iron, 0, 0.14, 0.22),
        mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.32, 8), materials.wood, 0, 0.27, 0.22),
        basket, fire,
    )
}

/** Bannière de velours pourpre frappée d'un cercle d'or, suspendue à une tringle. */
export function banner(materials: CastleMaterials) {
    const cloth = new THREE.Shape([
        new THREE.Vector2(-0.4, 0), new THREE.Vector2(0.4, 0), new THREE.Vector2(0.4, -1.6), new THREE.Vector2(0, -1.85), new THREE.Vector2(-0.4, -1.6),
    ])
    const geometry = new THREE.ShapeGeometry(cloth)
    const uvs = geometry.attributes.uv, position = geometry.attributes.position
    for (let index = 0; index < uvs.count; index++) uvs.setXY(index, position.getX(index) / TEXTURE_SIZE.velvet, position.getY(index) / TEXTURE_SIZE.velvet)
    return group(
        mesh(geometry, materials.velvet, 0, 0, 0.03),
        mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 8).rotateZ(Math.PI / 2), materials.gold, 0, 0.02, 0.04),
        mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 24), materials.gold, 0, -0.7, 0.045),
    )
}
