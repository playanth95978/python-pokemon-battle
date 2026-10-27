/** Décor 3D construit à partir de la carte 2D existante, lue sans la modifier. */
import * as THREE from 'three'
import type { Building, Position, WorldMap } from '../world/types'
import { tileAt } from '../world/worldMap'
import { GROUND_TILE } from './worldMaterials'
import type { WorldMaterials } from './worldMaterials'
import type { ChunkKey } from './worldChunks'
import { chunkTiles } from './worldChunks'

export const WATER_LEVEL = -0.12
const LAKE_DEPTH = -0.55
const GRASS_PER_TILE = 10

/** Centre d'une case de la grille en coordonnées 3D (1 case = 1 unité). */
export function tileCenter(x: number, y: number) {
    return new THREE.Vector3(x + 0.5, 0, y + 0.5)
}

// Bruit déterministe : la même carte donne toujours le même décor, même après déchargement d'un chunk.
function hash(x: number, y: number, seed = 0) {
    const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return value - Math.floor(value)
}

/** Géométrie propre à un chunk : libérée avec lui (les géométries partagées ne le sont jamais). */
function owned<T extends THREE.BufferGeometry>(geometry: T) {
    geometry.userData.chunkOwned = true
    return geometry
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

export function waterNormals() {
    const size = 256, data = new Uint8Array(size * size * 4)
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Fonctions périodiques sur 256 px : la texture se répète sans couture.
            const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2
            const a = Math.sin(u * 3 + v * 2) + Math.sin(u * 5 - v * 4) * 0.5
            const b = Math.cos(v * 3 - u) + Math.cos(u * 4 + v * 6) * 0.5
            const offset = (y * size + x) * 4
            data.set([128 + a * 30, 128 + b * 30, 255, 255], offset)
        }
    }
    const texture = new THREE.DataTexture(data, size, size)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(10, 10)
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
    return texture
}

function addWater(scene: THREE.Scene, map: WorldMap, materials: WorldMaterials) {
    const normals = waterNormals()
    materials.water.normalMap = normals
    materials.water.normalScale.setScalar(0.35)
    const water = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.height), materials.water)
    water.rotation.x = -Math.PI / 2
    water.position.set(map.width / 2, WATER_LEVEL, map.height / 2)
    water.receiveShadow = true
    scene.add(water)
    return (time: number) => normals.offset.set(time * 0.012, time * 0.007)
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

export interface WorldBase {
    update: (time: number) => void
}

export function buildWorldBase(scene: THREE.Scene, map: WorldMap, materials: WorldMaterials): WorldBase {
    addGround(scene, map, materials)
    const animateWater = addWater(scene, map, materials)
    addBridge(scene, map, materials)
    addSigns(scene, map, materials)
    return {
        update(time) {
            materials.time.value = time
            animateWater(time)
        },
    }
}

// --- Chunks chargés en streaming ---

const trunkGeometry = new THREE.CylinderGeometry(0.09, 0.14, 1, 7).translate(0, 0.5, 0)
const foliageGeometry = new THREE.IcosahedronGeometry(0.62, 1)
const bladeGeometry = new THREE.ConeGeometry(0.035, 0.32, 3).translate(0, 0.16, 0)
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

function addTrees(group: THREE.Group, tiles: Position[], materials: WorldMaterials) {
    if (!tiles.length) return
    const trunk = instanced(trunkGeometry, materials.bark, tiles.length)
    const layers = [0, 1, 2].map(() => instanced(foliageGeometry, materials.foliage, tiles.length))
    const matrix = new THREE.Matrix4(), color = new THREE.Color(), rotation = new THREE.Quaternion(), euler = new THREE.Euler()
    tiles.forEach(({x, y}, index) => {
        const height = 0.8 + hash(x, y) * 0.9
        const center = tileCenter(x + (hash(x, y, 1) - 0.5) * 0.4, y + (hash(x, y, 2) - 0.5) * 0.4)
        trunk.setMatrixAt(index, matrix.compose(center, rotation.identity(), new THREE.Vector3(1, height, 1)))
        layers.forEach((layer, level) => {
            const size = (1.15 - level * 0.28) * (0.85 + hash(x, y, 3) * 0.4)
            rotation.setFromEuler(euler.set(0, hash(x, y, level) * 6.3, 0))
            layer.setMatrixAt(index, matrix.compose(center.clone().setY(height + 0.35 + level * 0.5), rotation, new THREE.Vector3(size, size * 0.85, size)))
            layer.setColorAt(index, color.setHSL(0.27 + hash(x, y, 5) * 0.06, 0.45, 0.22 + level * 0.05 + hash(x, y, 6) * 0.05))
        })
    })
    group.add(trunk, ...layers)
}

/** Répète une texture selon la taille réelle de chaque face d'une boîte (1 répétition par `unit`). */
function boxUv(geometry: THREE.BoxGeometry, width: number, height: number, depth: number, unit = 2) {
    const normals = geometry.attributes.normal, uvs = geometry.attributes.uv
    for (let index = 0; index < uvs.count; index++) {
        const [u, v] = Math.abs(normals.getX(index)) > 0.5 ? [depth, height]
            : Math.abs(normals.getY(index)) > 0.5 ? [width, depth] : [width, height]
        uvs.setXY(index, uvs.getX(index) * u / unit, uvs.getY(index) * v / unit)
    }
    return geometry
}

function addHouse(group: THREE.Group, building: Building, materials: WorldMaterials) {
    const house = new THREE.Group()
    const width = building.width - 0.3, depth = building.height - 0.4, wallHeight = 1.9
    house.position.set(building.x + building.width / 2, 0, building.y + building.height / 2 - 0.1)
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
        const mesh = new THREE.Mesh(owned(geometry), material)
        mesh.position.set(x, y, z)
        mesh.castShadow = true
        mesh.receiveShadow = true
        house.add(mesh)
        return mesh
    }
    add(boxUv(new THREE.BoxGeometry(width + 0.15, 0.3, depth + 0.15), width, 0.3, depth), materials.stone, 0, 0.15, 0)
    add(boxUv(new THREE.BoxGeometry(width, wallHeight, depth), width, wallHeight, depth), materials.plaster, 0, 0.3 + wallHeight / 2, 0)
    // Colombages : poteaux d'angle et poutre haute en bois.
    for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        add(new THREE.BoxGeometry(0.16, wallHeight, 0.16), materials.wood, x * width / 2, 0.3 + wallHeight / 2, z * depth / 2)
    }
    add(boxUv(new THREE.BoxGeometry(width + 0.1, 0.14, 0.14), width, 0.14, 0.14), materials.wood, 0, 0.3 + wallHeight - 0.07, depth / 2 + 0.02)
    // Toit à deux pans extrudé sur la profondeur, avec débord.
    const roofHeight = 1.5, overhang = 0.35
    const profile = new THREE.Shape()
    profile.moveTo(-width / 2 - overhang, 0)
    profile.lineTo(0, roofHeight)
    profile.lineTo(width / 2 + overhang, 0)
    profile.lineTo(width / 2 + overhang, -0.12)
    profile.lineTo(0, roofHeight - 0.12)
    profile.lineTo(-width / 2 - overhang, -0.12)
    const roofGeometry = new THREE.ExtrudeGeometry(profile, {depth: depth + overhang * 2, bevelEnabled: false})
    roofGeometry.translate(0, 0, -(depth + overhang * 2) / 2)
    add(roofGeometry, materials.roof(building.roof), 0, 0.3 + wallHeight, 0)
    const gableShape = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(0, roofHeight - 0.1), new THREE.Vector2(width / 2, 0)])
    for (const side of [-1, 1]) {
        // Les pignons sont des faces simples : celui du nord est retourné vers l'extérieur.
        add(new THREE.ShapeGeometry(gableShape), materials.plaster, 0, 0.3 + wallHeight, side * depth / 2).rotation.y = side < 0 ? Math.PI : 0
    }
    add(new THREE.BoxGeometry(0.4, 1.1, 0.4), materials.stone, width / 4, 0.3 + wallHeight + roofHeight * 0.6, -depth / 5)
    // Façade sud : porte et fenêtres émissives. Pas de lumière ponctuelle : chacune coûterait sur tous les pixels de la scène.
    add(new THREE.BoxGeometry(0.75, 1.3, 0.08), materials.wood, 0, 0.95, depth / 2 + 0.04)
    for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(0.6, 0.55, 0.06), materials.glass, side * width / 3.2, 1.35, depth / 2 + 0.03).castShadow = false
        add(new THREE.BoxGeometry(0.72, 0.08, 0.12), materials.wood, side * width / 3.2, 1.05, depth / 2 + 0.05)
    }
    group.add(house)
}

/** Arbres et maisons d'un chunk : visibles de loin, construits dans le rayon de chargement. */
export function buildDecorChunk(map: WorldMap, chunk: ChunkKey, materials: WorldMaterials) {
    const group = chunkGroup(`decor ${chunk.cx},${chunk.cy}`)
    const tiles = chunkTiles(map, chunk)
    addTrees(group, tiles.filter((tile) => tileAt(map, tile) === 'tree'), materials)
    // Une maison appartient au chunk de son coin nord-ouest.
    const inChunk = new Set(tiles.map(({x, y}) => `${x},${y}`))
    map.buildings.filter((building) => inChunk.has(`${building.x},${building.y}`))
        .forEach((building) => addHouse(group, building, materials))
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
            grass.setColorAt(tile * GRASS_PER_TILE + index, color.setHSL(0.24 + hash(x, y, index + 20) * 0.06, 0.6, 0.16 + hash(x, y, index + 30) * 0.08))
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
        if (object instanceof THREE.InstancedMesh) object.dispose()
        if (object instanceof THREE.Mesh && object.geometry.userData.chunkOwned) object.geometry.dispose()
    })
    group.removeFromParent()
}
