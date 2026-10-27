/** Décor 3D construit à partir de la carte 2D existante, lue sans la modifier. */
import * as THREE from 'three'
import type { Position, WorldMap } from '../world/types'
import { tileAt } from '../world/worldMap'
import { GROUND_TILE } from './worldMaterials'
import type { WorldMaterials } from './worldMaterials'
import type { ChunkKey } from './worldChunks'
import { chunkTiles } from './worldChunks'
import { EXIT, isExitGap } from './worldExit'
import type { TreeKind } from './realTrees'
import { animateTrees, treeInstances } from './realTrees'
import { createGrassBlade } from './grassBlade'
import type { VillageModels } from './villageModels'

export const WATER_LEVEL = -0.12
const LAKE_DEPTH = -0.55
const GRASS_PER_TILE = 16

/** Centre d'une case de la grille en coordonnées 3D (1 case = 1 unité). */
export function tileCenter(x: number, y: number) {
    return new THREE.Vector3(x + 0.5, 0, y + 0.5)
}

// Bruit déterministe : la même carte donne toujours le même décor, même après déchargement d'un chunk.
function hash(x: number, y: number, seed = 0) {
    const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return value - Math.floor(value)
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, castShadow = true) {
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    return mesh
}

function waterAmount(map: WorldMap, x: number, z: number) {
    // Un sommet touchant une case de terre reste à niveau : la rive ne passe jamais sous l'eau.
    for (const tx of new Set([Math.ceil(x) - 1, Math.floor(x)])) {
        for (const tz of new Set([Math.ceil(z) - 1, Math.floor(z)])) {
            if (tileAt(map, {x: tx, y: tz}) !== 'water') return 0
        }
    }
    // Ensuite le lit se creuse avec la distance à la rive.
    let water = 0
    for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) water += tileAt(map, {x: Math.floor(x + dx), y: Math.floor(z + dz)}) === 'water' ? 1 : 0
    }
    return water / 25
}

// --- Socle permanent : sol, eau, horizon, pont et panneaux (peu de triangles, toujours visibles) ---

function addGround(scene: THREE.Scene, map: WorldMap, materials: WorldMaterials) {
    const geometry = new THREE.PlaneGeometry(map.width, map.height, map.width * 2, map.height * 2)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(map.width / 2, 0, map.height / 2)
    const positions = geometry.attributes.position, uvs = geometry.attributes.uv
    for (let index = 0; index < positions.count; index++) {
        const x = positions.getX(index), z = positions.getZ(index)
        const water = waterAmount(map, x, z)
        const relief = (hash(Math.round(x * 2), Math.round(z * 2), 4) - 0.5) * 0.05
        positions.setY(index, water > 0 ? WATER_LEVEL - 0.08 + (LAKE_DEPTH - WATER_LEVEL) * water : relief)
        // UV en coordonnées du monde : le shader du sol en déduit la case sous chaque pixel.
        uvs.setXY(index, x / GROUND_TILE, z / GROUND_TILE)
    }
    geometry.computeVertexNormals()
    const ground = new THREE.Mesh(geometry, materials.ground)
    ground.receiveShadow = true
    scene.add(ground)
    // Collines hors carte pour fermer l'horizon.
    const hills = new THREE.Mesh(new THREE.RingGeometry(46, 140, 64, 4), new THREE.MeshStandardMaterial({color: 0x4f7a48, roughness: 1}))
    hills.rotation.x = -Math.PI / 2
    hills.position.set(map.width / 2, -0.02, map.height / 2)
    scene.add(hills)
}

/** Rectangle couvrant toutes les cases d'eau (lac et rivière), avec une case de marge : seul plan d'eau à refléter. */
export function waterBounds(map: WorldMap) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (tileAt(map, {x, y}) !== 'water') continue
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x + 1)
            maxY = Math.max(maxY, y + 1)
        }
    }
    return {x: (minX + maxX) / 2, z: (minY + maxY) / 2, width: maxX - minX + 2, depth: maxY - minY + 2}
}
function addBridge(scene: THREE.Scene, map: WorldMap, materials: WorldMaterials) {
    const planks: Position[] = []
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) if (tileAt(map, {x, y}) === 'bridge') planks.push({x, y})
    }
    if (!planks.length) return
    const plank = instanced(new THREE.BoxGeometry(0.95, 0.1, 0.22), materials.wood, planks.length * 4)
    const matrix = new THREE.Matrix4()
    planks.forEach(({x, y}, tile) => {
        for (let index = 0; index < 4; index++) {
            // Planches orientées le long de la rivière, comme sur un vrai pont.
            matrix.compose(new THREE.Vector3(x + 0.12 + index * 0.25, 0.04, y + 0.5),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 + (hash(x, y, index) - 0.5) * 0.06, 0)),
                new THREE.Vector3(1.05, 1, 1))
            plank.setMatrixAt(tile * 4 + index, matrix)
        }
    })
    scene.add(plank)
    const xs = planks.map((tile) => tile.x), ys = planks.map((tile) => tile.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs) + 1
    const postCount = (maxX - minX + 1) * 2
    const posts = instanced(new THREE.BoxGeometry(0.1, 0.65, 0.1), materials.wood, postCount)
    let post = 0
    for (const z of [Math.min(...ys) + 0.05, Math.max(...ys) + 0.95]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.08, 0.08), materials.wood)
        rail.position.set((minX + maxX) / 2, 0.6, z)
        rail.castShadow = true
        scene.add(rail)
        for (let x = minX; x <= maxX; x++) posts.setMatrixAt(post++, matrix.makeTranslation(x, 0.3, z))
    }
    scene.add(posts)
}

function addSigns(scene: THREE.Scene, map: WorldMap, materials: WorldMaterials) {
    const posts = instanced(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), materials.wood, map.landmarks.length)
    const boards = instanced(new THREE.BoxGeometry(0.7, 0.42, 0.06), materials.wood, map.landmarks.length)
    const matrix = new THREE.Matrix4()
    map.landmarks.forEach((landmark, index) => {
        const center = tileCenter(landmark.x, landmark.y)
        posts.setMatrixAt(index, matrix.makeTranslation(center.x, 0.45, center.z))
        boards.setMatrixAt(index, matrix.makeTranslation(center.x, 0.85, center.z))
    })
    scene.add(posts, boards)
}

/** Portail en bois au bout de la route est, avec un panneau vers le monde ouvert. */
function addExitGate(scene: THREE.Scene, materials: WorldMaterials) {
    const gate = new THREE.Group()
    const x = EXIT.x + 1, south = EXIT.maxY + 1, north = EXIT.minY
    gate.position.set(x, 0, (north + south) / 2)
    const span = south - north + 0.4
    for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), materials.wood)
        post.position.set(0, 1.3, side * span / 2)
        gate.add(post)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, span + 0.5), materials.wood)
    beam.position.y = 2.55
    gate.add(beam)
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const context = canvas.getContext('2d')!
    context.fillStyle = '#5a3a24'
    context.fillRect(0, 0, 512, 128)
    context.fillStyle = '#f6e7c1'
    context.font = 'bold 54px sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('Monde ouvert →', 256, 66)
    const label = new THREE.CanvasTexture(canvas)
    label.colorSpace = THREE.SRGBColorSpace
    // Panneau tourné vers le village (vers l'ouest), lisible en arrivant par la route.
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({map: label, roughness: 0.8}))
    board.position.set(-0.15, 2.1, 0)
    board.rotation.y = -Math.PI / 2
    gate.add(board)
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), materials.glass)
    lantern.position.set(-0.2, 2.3, span / 2)
    gate.add(lantern)
    gate.traverse((object) => { object.castShadow = true })
    scene.add(gate)
}

export interface WorldBase {
    update: (time: number) => void
}

export function buildWorldBase(scene: THREE.Scene, map: WorldMap, materials: WorldMaterials): WorldBase {
    // L'eau est créée à part (voir water.ts et waterBounds) : elle a besoin du renderer pour ses reflets.
    addGround(scene, map, materials)
    addBridge(scene, map, materials)
    addSigns(scene, map, materials)
    addExitGate(scene, materials)
    return {
        update(time) {
            materials.time.value = time
            animateTrees(time)
        },
    }
}

// --- Chunks chargés en streaming ---

const bladeGeometry = createGrassBlade(0.34, 0.055)
const flowerGeometry = new THREE.SphereGeometry(0.05, 6, 4)

function chunkGroup(name: string) {
    const group = new THREE.Group()
    group.name = name
    return group
}

/** Fige les matrices d'un chunk statique : three.js ne les recalcule plus à chaque image. */
function freeze(group: THREE.Object3D) {
    group.updateMatrixWorld(true)
    group.traverse((object) => {
        object.matrixAutoUpdate = false
        object.matrixWorldAutoUpdate = false
    })
    return group
}

/** Essence d'une case d'arbre : surtout des chênes, des trembles et quelques pins. */
function treeKind(x: number, y: number): TreeKind {
    const roll = hash(x, y, 7)
    return roll < 0.55 ? 'oak' : roll < 0.82 ? 'aspen' : 'pine'
}

function addTrees(group: THREE.Group, tiles: Position[]) {
    const byKind = new Map<TreeKind, Position[]>()
    for (const tile of tiles) {
        const kind = treeKind(tile.x, tile.y)
        byKind.set(kind, [...byKind.get(kind) ?? [], tile])
    }
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), euler = new THREE.Euler(), scale = new THREE.Vector3()
    for (const [kind, positions] of byKind) {
        const matrices = new Float32Array(positions.length * 16), colors = new Float32Array(positions.length * 3)
        positions.forEach(({x, y}, index) => {
            const center = tileCenter(x + (hash(x, y, 1) - 0.5) * 0.4, y + (hash(x, y, 2) - 0.5) * 0.4)
            rotation.setFromEuler(euler.set(0, hash(x, y, 3) * Math.PI * 2, 0))
            matrix.compose(center, rotation, scale.setScalar(0.8 + hash(x, y) * 0.45)).toArray(matrices, index * 16)
            const shade = 0.85 + hash(x, y, 5) * 0.3
            colors.set([shade, shade, shade * 0.95], index * 3)
        })
        group.add(treeInstances(kind, matrices, colors, true))
    }
}

/** Arbres et maisons d'un chunk : visibles de loin, construits dans le rayon de chargement. */
export function buildDecorChunk(map: WorldMap, chunk: ChunkKey, village: VillageModels) {
    const group = chunkGroup(`decor ${chunk.cx},${chunk.cy}`)
    const tiles = chunkTiles(map, chunk)
    addTrees(group, tiles.filter((tile) => tileAt(map, tile) === 'tree' && !isExitGap(tile)))
    // Une maison appartient au chunk de son coin nord-ouest.
    const inChunk = new Set(tiles.map(({x, y}) => `${x},${y}`))
    map.buildings.filter((building) => inChunk.has(`${building.x},${building.y}`))
        .forEach((building) => group.add(village.house(building)))
    return group.children.length ? freeze(group) : null
}

/** Brins d'herbe et fleurs d'un chunk : seulement près du joueur, c'est la couche la plus dense. */
export function buildGrassChunk(map: WorldMap, chunk: ChunkKey, materials: WorldMaterials) {
    const tiles = chunkTiles(map, chunk).filter((tile) => tileAt(map, tile) === 'grass')
    if (!tiles.length) return null
    const group = chunkGroup(`grass ${chunk.cx},${chunk.cy}`)
    const grass = instanced(bladeGeometry, materials.blade, tiles.length * GRASS_PER_TILE, false)
    const flowers = instanced(flowerGeometry, materials.flower, tiles.length, false)
    const matrix = new THREE.Matrix4(), color = new THREE.Color(), rotation = new THREE.Quaternion(), euler = new THREE.Euler()
    let flowerCount = 0
    tiles.forEach(({x, y}, tile) => {
        for (let index = 0; index < GRASS_PER_TILE; index++) {
            const position = new THREE.Vector3(x + hash(x, y, index), 0, y + hash(x, y, index + 10))
            rotation.setFromEuler(euler.set((hash(x, index, y) - 0.5) * 0.5, hash(y, x, index) * 6, 0))
            const size = 0.6 + hash(index, x, y) * 0.9
            grass.setMatrixAt(tile * GRASS_PER_TILE + index, matrix.compose(position, rotation, new THREE.Vector3(size, size, size)))
            grass.setColorAt(tile * GRASS_PER_TILE + index, color.setHSL(0.22 + hash(x, y, index + 20) * 0.07, 0.55, 0.24 + hash(x, y, index + 30) * 0.1))
        }
        if (hash(x, y, 40) > 0.82) {
            flowers.setMatrixAt(flowerCount, matrix.makeTranslation(x + hash(x, y, 41), 0.12, y + hash(x, y, 42)))
            flowers.setColorAt(flowerCount++, color.set([0xfff4a8, 0xf49ac1, 0xffffff, 0xb7a6ff][Math.floor(hash(x, y, 43) * 4)]))
        }
    })
    flowers.count = flowerCount
    group.add(grass, flowers)
    return freeze(group)
}

/** Libère les ressources GPU propres à un chunk ; les géométries et matériaux partagés restent en cache. */
export function disposeChunk(group: THREE.Object3D) {
    group.traverse((object) => {
        // Les géométries (arbres, herbe, maisons) sont partagées entre chunks : seules les instances sont libérées.
        if (object instanceof THREE.InstancedMesh) object.dispose()
    })
    group.removeFromParent()
}
