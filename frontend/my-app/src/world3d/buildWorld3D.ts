/** Décor 3D construit à partir de la carte 2D existante, lue sans la modifier. */
import * as THREE from 'three'
import type { Building, TileType, WorldMap } from '../world/types'
import { tileAt } from '../world/worldMap'

export const WATER_LEVEL = -0.12
const LAKE_DEPTH = -0.55

export interface WorldDecor {
    update: (time: number) => void
}

/** Centre d'une case de la grille en coordonnées 3D (1 case = 1 unité). */
export function tileCenter(x: number, y: number) {
    return new THREE.Vector3(x + 0.5, 0, y + 0.5)
}

// Bruit déterministe : la même carte donne toujours le même décor.
function hash(x: number, y: number, seed = 0) {
    const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return value - Math.floor(value)
}

function tilesOf(map: WorldMap, type: TileType) {
    const tiles: { x: number; y: number }[] = []
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) if (tileAt(map, {x, y}) === type) tiles.push({x, y})
    }
    return tiles
}

function canvasTexture(size: number, draw: (context: CanvasRenderingContext2D) => void, repeat = 1) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    draw(canvas.getContext('2d')!)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat, repeat)
    texture.anisotropy = 8
    return texture
}

const GROUND_COLORS: Record<TileType, [number, number, number]> = {
    grass: [104, 150, 72], path: [196, 168, 118], tree: [58, 92, 50],
    water: [120, 112, 86], bridge: [196, 168, 118], wall: [150, 140, 120],
}

function groundTexture(map: WorldMap) {
    const scale = 16
    return canvasTexture(map.width * scale, (context) => {
        const image = context.createImageData(map.width * scale, map.height * scale)
        for (let py = 0; py < map.height * scale; py++) {
            for (let px = 0; px < map.width * scale; px++) {
                // Couleurs mélangées sur les bords des cases pour éviter l'effet damier.
                const fx = px / scale - 0.5, fy = py / scale - 0.5
                const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
                const color = [0, 0, 0]
                for (const [dx, dy, weight] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
                    const tile = tileAt(map, {x: x0 + dx, y: y0 + dy}) ?? 'tree'
                    GROUND_COLORS[tile].forEach((channel, index) => {
                        color[index] += channel * weight
                    })
                }
                const grain = (hash(px, py) - 0.5) * 26 + (hash(Math.floor(px / 5), Math.floor(py / 5), 2) - 0.5) * 18
                const offset = (py * map.width * scale + px) * 4
                image.data[offset] = color[0] + grain
                image.data[offset + 1] = color[1] + grain
                image.data[offset + 2] = color[2] + grain * 0.6
                image.data[offset + 3] = 255
            }
        }
        context.putImageData(image, 0, 0)
    })
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
        for (let dx = -2; dx <= 2; dx++) water += tileAt(map, {
            x: Math.floor(x + dx),
            y: Math.floor(z + dz)
        }) === 'water' ? 1 : 0
    }
    return water / 25
}

function addGround(scene: THREE.Scene, map: WorldMap) {
    const geometry = new THREE.PlaneGeometry(map.width, map.height, map.width * 2, map.height * 2)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(map.width / 2, 0, map.height / 2)
    const positions = geometry.attributes.position
    for (let index = 0; index < positions.count; index++) {
        const x = positions.getX(index), z = positions.getZ(index)
        const water = waterAmount(map, x, z)
        const relief = (hash(Math.round(x * 2), Math.round(z * 2), 4) - 0.5) * 0.05
        positions.setY(index, water > 0 ? WATER_LEVEL - 0.08 + (LAKE_DEPTH - WATER_LEVEL) * water : relief)
    }
    geometry.computeVertexNormals()
    const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({map: groundTexture(map), roughness: 0.95}))
    ground.receiveShadow = true
    scene.add(ground)
    // Collines hors carte pour fermer l'horizon.
    const hills = new THREE.Mesh(new THREE.RingGeometry(46, 140, 64, 4), new THREE.MeshStandardMaterial({
        color: 0x4f7a48,
        roughness: 1
    }))
    hills.rotation.x = -Math.PI / 2
    hills.position.set(map.width / 2, -0.02, map.height / 2)
    scene.add(hills)
}

function addWater(scene: THREE.Scene, map: WorldMap) {
    const normals = canvasTexture(256, (context) => {
        const image = context.createImageData(256, 256)
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const a = Math.sin((x + y * 0.5) * 0.15) + Math.sin((x * 0.4 - y) * 0.11) + (hash(x, y, 9) - 0.5) * 0.6
                const b = Math.cos((y - x * 0.3) * 0.13) + Math.cos((x + y) * 0.09)
                const offset = (y * 256 + x) * 4
                image.data[offset] = 128 + a * 22
                image.data[offset + 1] = 128 + b * 22
                image.data[offset + 2] = 255
                image.data[offset + 3] = 255
            }
        }
        context.putImageData(image, 0, 0)
    }, 10)
    normals.colorSpace = THREE.NoColorSpace
    const material = new THREE.MeshPhysicalMaterial({
        color: 0x2f7f9c, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.82,
        normalMap: normals, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 1, clearcoatRoughness: 0.1,
    })
    const water = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.height), material)
    water.rotation.x = -Math.PI / 2
    water.position.set(map.width / 2, WATER_LEVEL, map.height / 2)
    water.receiveShadow = true
    scene.add(water)
    return (time: number) => normals.offset.set(time * 0.012, time * 0.007)
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, castShadow = true) {
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    return mesh
}

function addTrees(scene: THREE.Scene, map: WorldMap) {
    const tiles = tilesOf(map, 'tree')
    const trunk = instanced(new THREE.CylinderGeometry(0.09, 0.14, 1, 7).translate(0, 0.5, 0),
        new THREE.MeshStandardMaterial({color: 0x5b3b25, roughness: 1}), tiles.length)
    const foliageGeometry = new THREE.IcosahedronGeometry(0.62, 1)
    const foliageMaterial = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.9, flatShading: true})
    const layers = [0, 1, 2].map(() => instanced(foliageGeometry, foliageMaterial, tiles.length))
    const matrix = new THREE.Matrix4(), color = new THREE.Color()
    tiles.forEach(({x, y}, index) => {
        const height = 0.8 + hash(x, y) * 0.9
        const center = tileCenter(x + (hash(x, y, 1) - 0.5) * 0.4, y + (hash(x, y, 2) - 0.5) * 0.4)
        matrix.compose(center, new THREE.Quaternion(), new THREE.Vector3(1, height, 1))
        trunk.setMatrixAt(index, matrix)
        layers.forEach((layer, level) => {
            const size = (1.15 - level * 0.28) * (0.85 + hash(x, y, 3) * 0.4)
            const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hash(x, y, level) * 6.3, 0))
            matrix.compose(center.clone().setY(height + 0.35 + level * 0.5), rotation, new THREE.Vector3(size, size * 0.85, size))
            layer.setMatrixAt(index, matrix)
            layer.setColorAt(index, color.setHSL(0.27 + hash(x, y, 5) * 0.06, 0.45, 0.22 + level * 0.05 + hash(x, y, 6) * 0.05))
        })
    })
    scene.add(trunk, ...layers)
}

function addGrass(scene: THREE.Scene, map: WorldMap) {
    const tiles = tilesOf(map, 'grass')
    const perTile = 6
    const blade = new THREE.ConeGeometry(0.035, 0.32, 3).translate(0, 0.16, 0)
    const material = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1, envMapIntensity: 0.15})
    const time = {value: 0}
    // Vent : le haut des brins oscille, la base reste fixe.
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = time
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 root = instanceMatrix[3];
        transformed.x += sin(uTime * 1.8 + root.x * 0.6 + root.z * 0.4) * 0.35 * position.y;
        transformed.z += cos(uTime * 1.3 + root.x * 0.3) * 0.15 * position.y;`)
    }
    const grass = instanced(blade, material, tiles.length * perTile, false)
    const flowers = instanced(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.6
    }), tiles.length)
    const matrix = new THREE.Matrix4(), color = new THREE.Color()
    let flowerCount = 0
    tiles.forEach(({x, y}, tile) => {
        for (let index = 0; index < perTile; index++) {
            const position = new THREE.Vector3(x + hash(x, y, index), 0, y + hash(x, y, index + 10))
            const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler((hash(x, index, y) - 0.5) * 0.5, hash(y, x, index) * 6, 0))
            const size = 0.6 + hash(index, x, y) * 0.9
            matrix.compose(position, rotation, new THREE.Vector3(size, size, size))
            grass.setMatrixAt(tile * perTile + index, matrix)
            grass.setColorAt(tile * perTile + index, color.setHSL(0.24 + hash(x, y, index + 20) * 0.06, 0.6, 0.16 + hash(x, y, index + 30) * 0.08))
        }
        if (hash(x, y, 40) > 0.82) {
            matrix.makeTranslation(x + hash(x, y, 41), 0.12, y + hash(x, y, 42))
            flowers.setMatrixAt(flowerCount, matrix)
            flowers.setColorAt(flowerCount++, color.set([0xfff4a8, 0xf49ac1, 0xffffff, 0xb7a6ff][Math.floor(hash(x, y, 43) * 4)]))
        }
    })
    flowers.count = flowerCount
    scene.add(grass, flowers)
    return (now: number) => {
        time.value = now
    }
}

function plasterTexture() {
    return canvasTexture(256, (context) => {
        context.fillStyle = '#eee2c8'
        context.fillRect(0, 0, 256, 256)
        for (let index = 0; index < 1400; index++) {
            context.fillStyle = `rgba(120, 100, 70, ${hash(index, 1) * 0.08})`
            context.fillRect(hash(index, 2) * 256, hash(index, 3) * 256, 3, 3)
        }
        // Colombages.
        context.fillStyle = '#6b4a31'
        context.fillRect(0, 0, 256, 14);
        context.fillRect(0, 242, 256, 14)
        context.fillRect(0, 0, 14, 256);
        context.fillRect(121, 0, 14, 256)
    })
}

function shingleTexture() {
    return canvasTexture(256, (context) => {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, 256, 256)
        for (let row = 0; row < 16; row++) {
            for (let column = 0; column < 9; column++) {
                context.fillStyle = `rgba(0, 0, 0, ${0.05 + hash(row, column) * 0.12})`
                context.fillRect(column * 32 + (row % 2) * 16, row * 16, 30, 14)
            }
        }
    }, 2)
}

function addHouse(scene: THREE.Scene, building: Building, plaster: THREE.Texture, shingles: THREE.Texture) {
    const house = new THREE.Group()
    const width = building.width - 0.3, depth = building.height - 0.4, wallHeight = 1.9
    house.position.set(building.x + building.width / 2, 0, building.y + building.height / 2 - 0.1)
    const shadow = (mesh: THREE.Mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        house.add(mesh);
        return mesh
    }
    const stone = new THREE.MeshStandardMaterial({color: 0x8d877d, roughness: 1})
    shadow(new THREE.Mesh(new THREE.BoxGeometry(width + 0.15, 0.3, depth + 0.15), stone)).position.y = 0.15
    const walls = shadow(new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), new THREE.MeshStandardMaterial({
        map: plaster,
        roughness: 0.9,
        envMapIntensity: 0.3
    })))
    walls.position.y = 0.3 + wallHeight / 2
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
    const roof = shadow(new THREE.Mesh(roofGeometry, new THREE.MeshStandardMaterial({
        color: building.roof,
        map: shingles,
        roughness: 0.75
    })))
    roof.position.y = 0.3 + wallHeight
    const gableShape = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(0, roofHeight - 0.1), new THREE.Vector2(width / 2, 0)])
    for (const side of [-1, 1]) {
        const gable = shadow(new THREE.Mesh(new THREE.ShapeGeometry(gableShape), new THREE.MeshStandardMaterial({
            map: plaster,
            side: THREE.DoubleSide
        })))
        gable.position.set(0, 0.3 + wallHeight, side * depth / 2)
    }
    const chimney = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), stone))
    chimney.position.set(width / 4, 0.3 + wallHeight + roofHeight * 0.6, -depth / 5)
    // Façade sud : porte et fenêtres éclairées de l'intérieur.
    const wood = new THREE.MeshStandardMaterial({color: 0x5a3a24, roughness: 0.8})
    const door = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.3, 0.08), wood))
    door.position.set(0, 0.95, depth / 2 + 0.04)
    const glass = new THREE.MeshStandardMaterial({
        color: 0xffe2a3,
        emissive: 0xffb54d,
        emissiveIntensity: 1.6,
        roughness: 0.2
    })
    for (const side of [-1, 1]) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.06), glass)
        window.position.set(side * width / 3.2, 1.35, depth / 2 + 0.03)
        house.add(window)
        const frame = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.12), wood))
        frame.position.set(side * width / 3.2, 1.05, depth / 2 + 0.05)
    }
    const light = new THREE.PointLight(0xffb866, 2.5, 4, 2)
    light.position.set(0, 1.6, depth / 2 + 0.6)
    house.add(light)
    scene.add(house)
}

function addBridge(scene: THREE.Scene, map: WorldMap) {
    const planks = tilesOf(map, 'bridge')
    const wood = new THREE.MeshStandardMaterial({color: 0x8a5a36, roughness: 0.85})
    const plank = instanced(new THREE.BoxGeometry(0.95, 0.1, 0.22), wood, planks.length * 4)
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
    for (const z of [Math.min(...ys) + 0.05, Math.max(...ys) + 0.95]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.08, 0.08), wood)
        rail.position.set((minX + maxX) / 2, 0.6, z)
        rail.castShadow = true
        scene.add(rail)
        for (let x = minX; x <= maxX; x += 1) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.1), wood)
            post.position.set(x, 0.3, z)
            post.castShadow = true
            scene.add(post)
        }
    }
}

function addSigns(scene: THREE.Scene, map: WorldMap) {
    const wood = new THREE.MeshStandardMaterial({color: 0x7a5032, roughness: 0.9})
    for (const landmark of map.landmarks) {
        const sign = new THREE.Group()
        sign.position.copy(tileCenter(landmark.x, landmark.y))
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), wood)
        post.position.y = 0.45
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.06), wood)
        board.position.y = 0.85
        for (const mesh of [post, board]) {
            mesh.castShadow = true;
            sign.add(mesh)
        }
        scene.add(sign)
    }
}

export function buildWorld3D(scene: THREE.Scene, map: WorldMap): WorldDecor {
    addGround(scene, map)
    const animateWater = addWater(scene, map)
    addTrees(scene, map)
    const animateGrass = addGrass(scene, map)
    const plaster = plasterTexture(), shingles = shingleTexture()
    map.buildings.forEach((building) => addHouse(scene, building, plaster, shingles))
    addBridge(scene, map)
    addSigns(scene, map)
    return {
        update(time) {
            animateWater(time)
            animateGrass(time)
        },
    }
}
