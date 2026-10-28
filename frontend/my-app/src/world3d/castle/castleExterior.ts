/**
 * Château vu de l'extérieur, dans le grand pré au sud-ouest de Clairbois : remparts crénelés, tours d'angle,
 * tours de porte, donjon central, herse, torches et bannières. Son emprise bloque le passage ; la porte ouest
 * mène à l'intérieur (castleMode.ts).
 */
import * as THREE from 'three'
import type { Direction, Position } from '../../world/types'
import type { CastleMaterials } from './castleMaterials'
import { TEXTURE_SIZE, texturedBox, texturedCylinder } from './castleMaterials'
import { banner, wallTorch } from './castleProps'
import { CASTLE_AREA, castleBlocks } from './castleArea'

export { CASTLE_AREA, castleBlocks }

const GATE_ROWS = [50, 51]
/** Case devant la porte, où l'on ressort du château. */
export { CASTLE_DOORSTEP } from './castleArea'
/** Chemin pavé depuis la grande route (x = 17 à 19) jusqu'à la porte. */
const PATH = {fromX: 20, toX: 22}
const WALL_HEIGHT = 7.5, WALL_THICKNESS = 0.9

/** Pousser vers l'est contre la porte fait entrer dans le château. */
export function entersCastle(target: Position, direction: Direction) {
    return direction === 'right' && target.x === CASTLE_AREA.x && GATE_ROWS.includes(target.y)
}

/** Sol couvert par le château ou son chemin pavé : l'herbe n'y pousse pas. */
export function isCastleGround(position: Position) {
    return castleBlocks(position) || (position.x >= PATH.fromX && position.x <= PATH.toX && GATE_ROWS.includes(position.y))
}

export function buildCastleExterior(scene: THREE.Scene, materials: CastleMaterials) {
    const castle = new THREE.Group()
    castle.name = 'château'
    // Matériaux propres à la façade : l'intérieur conserve son éclairage et ses textures.
    const stone = materials.rampart.clone()
    stone.color.setHex(0x525363)
    const roof = materials.roof.clone()
    roof.color.setHex(0x252536)
    // Les textures arrivent après la construction : un clone initial ne les reçoit pas automatiquement.
    void materials.ready.then(() => {
        for (const [target, source] of [[stone, materials.rampart], [roof, materials.roof]]) {
            target.map = source.map
            target.normalMap = source.normalMap
            target.roughnessMap = source.roughnessMap
            target.needsUpdate = true
        }
    })
    const glow = new THREE.MeshBasicMaterial({color: 0x9973cc})
    const recess = new THREE.MeshBasicMaterial({color: 0x100f1a})
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(x, y, z)
        mesh.castShadow = true
        mesh.receiveShadow = true
        castle.add(mesh)
        return mesh
    }
    const wall = (width: number, height: number, depth: number, x: number, y: number, z: number) =>
        add(texturedBox(width, height, depth, TEXTURE_SIZE.rampart), stone, x, y, z)
    const left = CASTLE_AREA.x, top = CASTLE_AREA.y, right = left + CASTLE_AREA.width, bottom = top + CASTLE_AREA.depth
    const centerX = (left + right) / 2, centerZ = (top + bottom) / 2
    const gateTop = GATE_ROWS[0], gateBottom = GATE_ROWS[GATE_ROWS.length - 1] + 1

    // Cour pavée et chemin jusqu'à la grande route.
    add(texturedBox(CASTLE_AREA.width, 0.1, CASTLE_AREA.depth, TEXTURE_SIZE.stoneFloor), materials.stoneFloor, centerX, 0.05, centerZ)
    add(texturedBox(PATH.toX - PATH.fromX + 1.3, 0.06, gateBottom - gateTop, TEXTURE_SIZE.stoneFloor), materials.stoneFloor, (PATH.fromX + left + 0.3) / 2, 0.03, (gateTop + gateBottom) / 2)

    // Remparts : nord, sud, est, et ouest en deux tronçons de part et d'autre de la porte.
    const half = WALL_THICKNESS / 2
    wall(CASTLE_AREA.width, WALL_HEIGHT, WALL_THICKNESS, centerX, WALL_HEIGHT / 2, top + half)
    wall(CASTLE_AREA.width, WALL_HEIGHT, WALL_THICKNESS, centerX, WALL_HEIGHT / 2, bottom - half)
    wall(WALL_THICKNESS, WALL_HEIGHT, CASTLE_AREA.depth, right - half, WALL_HEIGHT / 2, centerZ)
    wall(WALL_THICKNESS, WALL_HEIGHT, gateTop - top, left + half, WALL_HEIGHT / 2, (top + gateTop) / 2)
    wall(WALL_THICKNESS, WALL_HEIGHT, bottom - gateBottom, left + half, WALL_HEIGHT / 2, (gateBottom + bottom) / 2)
    wall(WALL_THICKNESS, 1.7, gateBottom - gateTop, left + half, WALL_HEIGHT - 0.85, (gateTop + gateBottom) / 2)

    // Créneaux : merlons réguliers sur le chemin de ronde, partagés en une seule instance.
    const merlons: THREE.Matrix4[] = []
    const merlon = (x: number, z: number) => merlons.push(new THREE.Matrix4().makeTranslation(x, WALL_HEIGHT + 0.3, z))
    for (let x = left + 0.6; x < right - 0.4; x += 0.85) {
        merlon(x, top + half)
        merlon(x, bottom - half)
    }
    for (let z = top + 0.6; z < bottom - 0.4; z += 0.85) {
        merlon(right - half, z)
        merlon(left + half, z)
    }
    const merlonMesh = new THREE.InstancedMesh(texturedBox(0.45, 0.6, WALL_THICKNESS, TEXTURE_SIZE.rampart), stone, merlons.length)
    merlons.forEach((matrix, index) => merlonMesh.setMatrixAt(index, matrix))
    merlonMesh.castShadow = true
    merlonMesh.receiveShadow = true
    castle.add(merlonMesh)

    // Tours : fût cylindrique, couronne crénelée, toit conique en ardoise.
    const tower = (x: number, z: number, radius: number, height: number) => {
        add(texturedCylinder(radius, radius * 1.08, height, 20, TEXTURE_SIZE.rampart), stone, x, height / 2, z)
        add(texturedCylinder(radius + 0.18, radius + 0.18, 0.5, 20, TEXTURE_SIZE.rampart), stone, x, height + 0.25, z)
        const spireHeight = radius * 4.2
        add(texturedCylinder(0, radius + 0.4, spireHeight, 20, TEXTURE_SIZE.rampart / 2), roof, x, height + 0.5 + spireHeight / 2, z)
        add(new THREE.ConeGeometry(0.1, 1.2, 6), materials.iron, x, height + spireHeight + 1, z)
        // Meurtrières lumineuses, tournées vers l'extérieur.
        for (let level = 1; level < height / 2.2; level++) {
            const slit = add(new THREE.PlaneGeometry(0.22, 1.05), glow, 0, 0, 0)
            const angle = Math.atan2(x - centerX, z - centerZ) + level * 0.7
            slit.position.set(x + Math.sin(angle) * (radius + 0.06), level * 2.2, z + Math.cos(angle) * (radius + 0.06))
            slit.rotation.y = angle
            slit.castShadow = false
        }
    }
    for (const [x, z] of [[left + 1, top + 1], [right - 1, top + 1], [left + 1, bottom - 1], [right - 1, bottom - 1]]) tower(x, z, 1.65, x < centerX ? 11 : 13)
    tower(left + 0.6, gateTop - 1, 0.95, 10)
    tower(left + 0.6, gateBottom + 1, 0.95, 11.5)

    // Donjon central avec ses tourelles et son toit pyramidal.
    const keepX = centerX + 1, keepSize = 7.4, keepHeight = 17
    wall(keepSize, keepHeight, keepSize, keepX, keepHeight / 2, centerZ)
    add(texturedCylinder(0, keepSize * 0.78, 7, 4, TEXTURE_SIZE.rampart / 2).rotateY(Math.PI / 4), roof, keepX, keepHeight + 3.5, centerZ)
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tower(keepX + dx * keepSize / 2, centerZ + dz * keepSize / 2, 0.7, keepHeight + 1.2)
    for (const level of [5, 9, 13]) {
        for (const offset of [-1.6, 0, 1.6]) {
            const arch = new THREE.Shape()
            arch.moveTo(-0.4, -1)
            arch.lineTo(0.4, -1)
            arch.lineTo(0.4, 0.4)
            arch.quadraticCurveTo(0.35, 0.9, 0, 1.3)
            arch.quadraticCurveTo(-0.35, 0.9, -0.4, 0.4)
            arch.closePath()
            const pane = add(new THREE.ShapeGeometry(arch), glow, keepX - keepSize / 2 - 0.02, level, centerZ + offset)
            pane.rotation.y = -Math.PI / 2
            pane.castShadow = false
            wall(0.12, 2, 0.08, keepX - keepSize / 2 - 0.05, level, centerZ + offset)
        }
    }

    // Contreforts effilés : une silhouette gothique lisible depuis le village.
    for (const z of [top + 1.8, bottom - 1.8]) {
        for (const x of [left + 0.7, right - 0.7]) {
            wall(0.65, 9, 0.7, x, 4.5, z)
            add(new THREE.ConeGeometry(0.48, 2.8, 4), roof, x, 10.4, z)
        }
    }
    // Rosace aveugle au-dessus du portail.
    add(new THREE.CircleGeometry(0.8, 16), recess, left - 0.03, 6, (gateTop + gateBottom) / 2).rotation.y = -Math.PI / 2
    const rose = add(new THREE.TorusGeometry(0.67, 0.07, 6, 16), materials.iron, left - 0.06, 6, (gateTop + gateBottom) / 2)
    rose.rotation.y = -Math.PI / 2

    // Porte : passage sombre, battants de bois entrouverts, herse levée et torches.
    const gateZ = (gateTop + gateBottom) / 2, gateWidth = gateBottom - gateTop
    add(new THREE.PlaneGeometry(gateWidth, 3.3), new THREE.MeshBasicMaterial({color: 0x0b0806}), left + 0.6, 1.65, gateZ).rotation.y = -Math.PI / 2
    for (const side of [-1, 1]) {
        const leaf = add(texturedBox(0.12, 3.2, gateWidth / 2, TEXTURE_SIZE.wood), materials.wood, left + 0.25, 1.6, gateZ + side * gateWidth / 4)
        leaf.rotation.y = side * 0.35
    }
    const bars: THREE.Mesh[] = []
    for (let index = 0; index <= 8; index++) bars.push(add(new THREE.BoxGeometry(0.06, 1.4, 0.06), materials.iron, left + 0.05, 4.1, gateTop + index * gateWidth / 8))
    add(new THREE.BoxGeometry(0.06, 0.08, gateWidth), materials.iron, left + 0.05, 3.5, gateZ)
    for (const z of [gateTop - 0.35, gateBottom + 0.35]) {
        const torch = wallTorch(materials)
        torch.position.set(left - 0.02, 2.2, z)
        torch.rotation.y = -Math.PI / 2
        castle.add(torch)
    }
    const gateLight = new THREE.PointLight(0x9374d4, 5, 9, 2)
    gateLight.position.set(left - 0.8, 2.6, gateZ)
    castle.add(gateLight)
    for (const z of [top + 2.5, bottom - 2.5]) {
        const flag = banner(materials)
        flag.position.set(left - 0.03, 4.4, z)
        flag.rotation.y = -Math.PI / 2
        castle.add(flag)
    }

    scene.add(castle)
    castle.updateMatrixWorld(true)
    castle.traverse((object) => {
        object.matrixAutoUpdate = false
    })
    return {
        group: castle,
        /** Les torches de la porte vacillent : seule la lumière bouge, la géométrie reste figée. */
        update(time: number) {
            gateLight.intensity = 6 * (0.85 + 0.15 * Math.sin(time * 9.1) * Math.sin(time * 5.3 + 1))
        },
    }
}
