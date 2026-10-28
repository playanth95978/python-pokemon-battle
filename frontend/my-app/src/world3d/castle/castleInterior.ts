/**
 * Intérieur 3D du château, généré depuis le plan (castleLayout.ts). Sols, murs et plafonds sont des quads
 * fusionnés par matériau, avec des UV en coordonnées du monde : la pierre et le bois se raccordent d'une case
 * à l'autre. Seules les faces tournées vers une case praticable existent : vues de dos, elles disparaissent,
 * et la caméra peut reculer derrière un mur sans le voir.
 */
import * as THREE from 'three'
import type { CastleDoor, CastleItem, CastleRoom, Tile } from './castleLayout'
import { BOSS, DOORS, EXIT, FLOOR_DEPTH, FLOOR_WIDTH, ITEMS, PROPS, roomAt, ROOMS, STAIRS, tileAt } from './castleLayout'
import type { CastleMaterials, WallKind } from './castleMaterials'
import { TEXTURE_SIZE, texturedBox } from './castleMaterials'
import { banner, buildProp, chandelier, WALL_HEIGHT, wallTorch } from './castleProps'
import { createMewtwo } from './mewtwo'

const H = WALL_HEIGHT
const DOOR_HEIGHT = 2.7

export interface RoomTheme {
    walls: WallKind
    tint: number
    /** Couleur et force de l'éclairage d'ambiance de la pièce (lustre ou lumière du jour). */
    light: number
    fill: number
    chandelier: boolean
}

/** Chaque pièce a son caractère : revêtement des murs, teinte et couleur de lumière. */
export const ROOM_THEMES: Record<string, RoomTheme> = {
    hall: {walls: 'brick', tint: 0xe2d6c6, light: 0xffc27a, fill: 1, chandelier: true},
    armory: {walls: 'brick', tint: 0xb7c2d2, light: 0xcfe0ff, fill: 0.8, chandelier: false},
    kitchen: {walls: 'brick', tint: 0xe8b993, light: 0xffa04a, fill: 0.85, chandelier: true},
    library: {walls: 'wood', tint: 0xc49a6c, light: 0xffd69a, fill: 0.9, chandelier: true},
    gallery: {walls: 'plaster', tint: 0x9b3b36, light: 0xffe2b5, fill: 1, chandelier: true},
    chapel: {walls: 'plaster', tint: 0xf1e9dc, light: 0xc7a2ff, fill: 0.9, chandelier: false},
    bedroom: {walls: 'plaster', tint: 0x9db79c, light: 0xffc890, fill: 0.85, chandelier: false},
    treasury: {walls: 'plaster', tint: 0x2f6b55, light: 0xffd768, fill: 1, chandelier: true},
    // Le marbre est presque blanc : lumière d'ambiance plus douce et teinte plus soutenue, sinon tout se délave.
    antechamber: {walls: 'marble', tint: 0xa9b0bf, light: 0xb9cdff, fill: 0.5, chandelier: false},
    throne: {walls: 'marble', tint: 0xb9a9cc, light: 0xd2a8ff, fill: 0.75, chandelier: true},
}
const DEFAULT_THEME = ROOM_THEMES.hall
/** Pièces qui accrochent aussi quelques tableaux (la galerie en est couverte). */
const PORTRAIT_ROOMS = ['hall', 'bedroom', 'treasury', 'antechamber']
const WALL_SIZE: Record<WallKind, number> = {brick: TEXTURE_SIZE.brick, plaster: TEXTURE_SIZE.plaster, wood: TEXTURE_SIZE.wood * 1.5, marble: TEXTURE_SIZE.marble}

/** Accumule des quads (deux triangles) et leurs UV avant de les fusionner en une géométrie. */
class Quads {
    positions: number[] = []
    normals: number[] = []
    uvs: number[] = []
    indices: number[] = []
    private readonly edge1 = new THREE.Vector3()
    private readonly edge2 = new THREE.Vector3()

    add(corners: THREE.Vector3[], normal: THREE.Vector3, uv: [number, number][]) {
        // Ordre des sommets ajusté pour que la face avant regarde vers `normal`.
        this.edge1.subVectors(corners[1], corners[0])
        this.edge2.subVectors(corners[2], corners[0])
        const order = this.edge1.cross(this.edge2).dot(normal) >= 0 ? [0, 1, 2, 3] : [0, 3, 2, 1]
        const base = this.positions.length / 3
        for (const index of order) {
            this.positions.push(corners[index].x, corners[index].y, corners[index].z)
            this.normals.push(normal.x, normal.y, normal.z)
            this.uvs.push(...uv[index])
        }
        this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }

    mesh(material: THREE.Material) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2))
        geometry.setIndex(this.indices)
        geometry.computeBoundingSphere()
        const mesh = new THREE.Mesh(geometry, material)
        mesh.receiveShadow = true
        mesh.castShadow = true
        return mesh
    }
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const SIDES: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

function walkable(tile: Tile) {
    return tileAt(tile) !== 'wall'
}

function isStairs(tile: Tile, up: boolean) {
    return STAIRS.some((stairs) => stairs.floor === tile.floor && stairs.x === tile.x && stairs.z === tile.z && stairs.up === up)
}

/** Vitrail, portraits : petites toiles peintes en code. */
function canvasTexture(draw: (context: CanvasRenderingContext2D, size: number) => void, size = 256) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    draw(canvas.getContext('2d')!, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

function stainedGlass() {
    return canvasTexture((context, size) => {
        const colors = ['#5b1fa8', '#2d6fd6', '#c0392b', '#e5b52a', '#2e9e6a', '#8e44ad']
        context.fillStyle = '#16101e'
        context.fillRect(0, 0, size, size)
        for (let ring = 0; ring < 6; ring++) {
            for (let piece = 0; piece < 12; piece++) {
                context.beginPath()
                context.moveTo(size / 2, size / 2)
                context.arc(size / 2, size / 2, size / 2 - ring * 18, piece / 12 * Math.PI * 2, (piece + 1) / 12 * Math.PI * 2)
                context.fillStyle = colors[(piece + ring * 5) % colors.length]
                context.fill()
                context.strokeStyle = '#120c18'
                context.lineWidth = 3
                context.stroke()
            }
        }
        // Silhouette psychique au centre : deux cornes et une longue queue.
        context.fillStyle = '#f2e8ff'
        context.beginPath()
        context.ellipse(size / 2, size / 2 + 10, 22, 38, 0, 0, Math.PI * 2)
        context.fill()
        context.beginPath()
        context.arc(size / 2, size / 2 - 38, 16, 0, Math.PI * 2)
        context.fill()
    })
}

function portrait(seed: number) {
    return canvasTexture((context, size) => {
        const hues = [12, 210, 280, 140, 35]
        const hue = hues[seed % hues.length]
        const gradient = context.createLinearGradient(0, 0, 0, size)
        gradient.addColorStop(0, `hsl(${hue}, 25%, 18%)`)
        gradient.addColorStop(1, `hsl(${hue}, 30%, 8%)`)
        context.fillStyle = gradient
        context.fillRect(0, 0, size, size)
        context.fillStyle = `hsl(${(hue + 180) % 360}, 35%, 28%)`
        context.beginPath()
        context.ellipse(size / 2, size * 0.92, size * 0.36, size * 0.34, 0, Math.PI, 0)
        context.fill()
        context.fillStyle = '#d9b38c'
        context.beginPath()
        context.ellipse(size / 2, size * 0.42, size * 0.15, size * 0.19, 0, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = seed % 2 ? '#3a2416' : '#c9c3b8'
        context.beginPath()
        context.ellipse(size / 2, size * 0.32, size * 0.17, size * 0.12, 0, Math.PI, 0)
        context.fill()
    }, 128)
}

function itemMesh(item: CastleItem, materials: CastleMaterials) {
    const group = new THREE.Group()
    const tint = new THREE.MeshStandardMaterial({color: item.color, roughness: 0.15, metalness: 0.1, emissive: item.color, emissiveIntensity: 0.35, transparent: true, opacity: 0.9})
    if (item.kind === 'potion') {
        group.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), tint))
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.12, 12), new THREE.MeshStandardMaterial({color: 0xdde6ee, roughness: 0.1, transparent: true, opacity: 0.7}))
        neck.position.y = 0.16
        const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.05, 10), materials.wood)
        cork.position.y = 0.24
        group.add(neck, cork)
    } else if (item.kind === 'key') {
        const metal = new THREE.MeshStandardMaterial({color: item.color, metalness: 1, roughness: 0.25, emissive: item.color, emissiveIntensity: 0.15})
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 10, 20), metal)
        ring.position.y = 0.16
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 8), metal)
        shaft.position.y = -0.07
        const teeth = [0, 1].map((index) => {
            const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.03), metal)
            tooth.position.set(0.05, -0.17 + index * 0.07, 0)
            return tooth
        })
        group.add(ring, shaft, ...teeth)
    } else if (item.kind === 'ball') {
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), tint)
        const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({color: 0xf4f4f4, roughness: 0.25}))
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 8, 32).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({color: 0x111111}))
        const button = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({color: 0xffffff}))
        button.position.z = 0.15
        group.add(top, bottom, band, button)
    } else if (item.kind === 'candy') {
        group.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12).scale(1.3, 1, 1), tint))
        for (const side of [-1, 1]) {
            const wrap = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 8).rotateZ(side * Math.PI / 2), tint)
            wrap.position.x = side * 0.18
            group.add(wrap)
        }
    } else {
        group.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 1).scale(1, 0.8, 1), new THREE.MeshStandardMaterial({color: item.color, roughness: 0.4, metalness: 0.3, emissive: 0x3a4a8a, emissiveIntensity: 0.5})))
    }
    group.traverse((object) => { object.castShadow = true })
    // Halo coloré pour repérer l'objet de loin.
    const sparkle = new THREE.Object3D()
    sparkle.userData.light = {intensity: 1.2, color: item.color}
    group.add(sparkle)
    return group
}

export interface CastleFloor {
    group: THREE.Group
    /** Points d'ancrage des lumières (torches, âtre, braseros, fenêtres…), en coordonnées locales de l'étage. */
    lights: THREE.Object3D[]
    flames: THREE.Object3D[]
}

export interface CastleInterior {
    floors: CastleFloor[]
    /** Pivot des portes fermées à clé (s'ouvre de 90° une fois déverrouillée). */
    lockedDoors: Map<string, THREE.Object3D>
    items: Map<string, THREE.Object3D>
    boss: ReturnType<typeof createMewtwo>
}

function lockedDoor(door: CastleDoor, materials: CastleMaterials) {
    const alongX = walkable({floor: door.floor, x: door.x - 1, z: door.z}) && walkable({floor: door.floor, x: door.x + 1, z: door.z})
    const pivot = new THREE.Group()
    // Charnière sur un bord du passage ; le battant est à plat dans le plan du mur.
    pivot.position.set(door.x + (alongX ? 0.5 : 0), 0, door.z + (alongX ? 0 : 0.5))
    pivot.rotation.y = alongX ? Math.PI / 2 : 0
    const leaf = new THREE.Mesh(texturedBox(1, DOOR_HEIGHT, 0.1, TEXTURE_SIZE.wood), materials.wood)
    leaf.position.set(0.5, DOOR_HEIGHT / 2, 0)
    leaf.castShadow = true
    const lockColor = door.key === 'gold-key' ? 0xf5c542 : 0xd9dde3
    const lockMaterial = new THREE.MeshStandardMaterial({color: lockColor, metalness: 1, roughness: 0.3, emissive: lockColor, emissiveIntensity: 0.25})
    for (const y of [0.5, 2.2]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.08, 0.13), materials.iron)
        band.position.set(0.5, y, 0)
        pivot.add(band)
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), lockMaterial)
    lock.position.set(0.85, 1.25, 0)
    pivot.add(leaf, lock)
    return pivot
}

function buildFloor(floor: number, materials: CastleMaterials, lockedDoors: Map<string, THREE.Object3D>): CastleFloor {
    const group = new THREE.Group()
    group.name = `étage ${floor}`
    const floors: Record<string, Quads> = {stone: new Quads(), wood: new Quads(), marble: new Quads()}
    // Murs regroupés par pièce : chacune reçoit son revêtement ; portes et seuils prennent celui du hall.
    const walls = new Map<string, Quads>(), ceiling = new Quads()
    const wallsOf = (id: string) => {
        if (!walls.has(id)) walls.set(id, new Quads())
        return walls.get(id)!
    }
    const lights: THREE.Object3D[] = [], flames: THREE.Object3D[] = []
    const floorSize = {stone: TEXTURE_SIZE.stoneFloor, wood: TEXTURE_SIZE.wood * 1.5, marble: TEXTURE_SIZE.marble}
    const add = (object: THREE.Object3D) => {
        group.add(object)
        return object
    }

    for (let z = 0; z < FLOOR_DEPTH; z++) {
        for (let x = 0; x < FLOOR_WIDTH; x++) {
            const tile = {floor, x, z}
            if (!walkable(tile)) continue
            const style = roomAt(tile)?.style ?? 'stone'
            const down = isStairs(tile, false), up = isStairs(tile, true)
            if (!down) {
                const size = floorSize[style]
                floors[style].add([v(x, 0, z), v(x, 0, z + 1), v(x + 1, 0, z + 1), v(x + 1, 0, z)], v(0, 1, 0),
                    [[x / size, z / size], [x / size, (z + 1) / size], [(x + 1) / size, (z + 1) / size], [(x + 1) / size, z / size]])
            }
            if (!up) {
                const size = TEXTURE_SIZE.wood * 2
                ceiling.add([v(x, H, z), v(x + 1, H, z), v(x + 1, H, z + 1), v(x, H, z + 1)], v(0, -1, 0),
                    [[x / size, z / size], [(x + 1) / size, z / size], [(x + 1) / size, (z + 1) / size], [x / size, (z + 1) / size]])
            }
            // Murs : une face par côté qui donne sur une case pleine, tournée vers la case praticable.
            for (const [dx, dz] of SIDES) {
                if (walkable({floor, x: x + dx, z: z + dz})) continue
                const plane = dx ? x + (dx > 0 ? 1 : 0) : z + (dz > 0 ? 1 : 0)
                const roomId = roomAt(tile)?.id ?? 'hall'
                const size = WALL_SIZE[(ROOM_THEMES[roomId] ?? DEFAULT_THEME).walls]
                const corners = dx
                    ? [v(plane, 0, z), v(plane, 0, z + 1), v(plane, H, z + 1), v(plane, H, z)]
                    : [v(x, 0, plane), v(x + 1, 0, plane), v(x + 1, H, plane), v(x, H, plane)]
                const along = (point: THREE.Vector3) => (dx ? point.z : point.x) / size
                wallsOf(roomId).add(corners, v(-dx, 0, -dz), corners.map((point) => [along(point), point.y / size]) as [number, number][])
            }
        }
    }

    for (const [style, quads] of Object.entries(floors)) if (quads.positions.length) add(quads.mesh(materials[style === 'stone' ? 'stoneFloor' : style as 'wood' | 'marble']))
    for (const [roomId, quads] of walls) {
        const theme = ROOM_THEMES[roomId] ?? DEFAULT_THEME
        add(quads.mesh(materials.wall(theme.walls, theme.tint)))
    }
    const ceilingMesh = add(ceiling.mesh(materials.wood)) as THREE.Mesh
    ceilingMesh.castShadow = false

    // Linteaux et chambranles au-dessus des passages.
    for (const door of [...DOORS.filter((candidate) => candidate.floor === floor && !candidate.secret), ...(floor === EXIT.floor ? [EXIT] : [])]) {
        const alongX = walkable({floor, x: door.x - 1, z: door.z}) && walkable({floor, x: door.x + 1, z: door.z})
        const lintel = new THREE.Mesh(texturedBox(alongX ? 1 : 1.02, H - DOOR_HEIGHT, alongX ? 1.02 : 1, TEXTURE_SIZE.brick), materials.brick)
        lintel.position.set(door.x + 0.5, (H + DOOR_HEIGHT) / 2, door.z + 0.5)
        add(lintel)
        const beam = new THREE.Mesh(texturedBox(alongX ? 0.2 : 1.1, 0.18, alongX ? 1.1 : 0.2, TEXTURE_SIZE.wood), materials.wood)
        beam.position.set(door.x + 0.5, DOOR_HEIGHT + 0.09, door.z + 0.5)
        add(beam)
    }
    for (const door of DOORS.filter((candidate) => candidate.floor === floor && candidate.key)) {
        const pivot = lockedDoor(door, materials)
        lockedDoors.set(door.id, pivot)
        add(pivot)
    }
    // Passage secret : un bloc de maçonnerie bouche l'ouverture ; poussé, il s'enfonce dans le sol.
    for (const door of DOORS.filter((candidate) => candidate.floor === floor && candidate.secret)) {
        const block = new THREE.Mesh(texturedBox(1, H, 1, TEXTURE_SIZE.brick), materials.brick)
        block.position.set(door.x + 0.5, H / 2, door.z + 0.5)
        const slider = new THREE.Group()
        slider.userData.secret = true
        slider.add(block)
        lockedDoors.set(door.id, slider)
        add(slider)
    }
    if (floor === EXIT.floor) {
        // Grande porte ouverte sur le jour : un voile lumineux chaud dans l'embrasure.
        const daylight = new THREE.Mesh(new THREE.PlaneGeometry(1, DOOR_HEIGHT), new THREE.MeshBasicMaterial({color: new THREE.Color(3.2, 2.9, 2.3)}))
        daylight.rotation.y = Math.PI / 2
        daylight.position.set(EXIT.x + 0.02, DOOR_HEIGHT / 2, EXIT.z + 0.5)
        add(daylight)
        const sun = new THREE.Object3D()
        sun.position.set(EXIT.x + 1.2, 1.8, EXIT.z + 0.5)
        sun.userData.light = {intensity: 6, color: 0xffe2b8}
        add(sun)
        lights.push(sun)
    }

    // Escaliers : marches qui montent vers le mur est, ou qui s'enfoncent sous le sol.
    for (const stairs of STAIRS.filter((candidate) => candidate.floor === floor)) {
        for (let step = 0; step < 6; step++) {
            // En montant, chaque marche est plus haute ; en descendant, le dessus de chaque marche est plus bas.
            const height = stairs.up ? (step + 1) * H / 6 : H - (step + 1) * H / 6
            if (height <= 0) continue
            const stepMesh = new THREE.Mesh(texturedBox(1 / 6, height, 1, TEXTURE_SIZE.stoneFloor), materials.stoneFloor)
            stepMesh.position.set(stairs.x + (step + 0.5) / 6, stairs.up ? height / 2 : -H + height / 2, stairs.z + 0.5)
            stepMesh.castShadow = true
            stepMesh.receiveShadow = true
            add(stepMesh)
        }
        if (!stairs.up) {
            // Parois et fond de la trémie, côté pièce comme côté mur.
            const pit = new Quads(), size = TEXTURE_SIZE.brick
            for (const [dx, dz] of SIDES) {
                const plane = dx ? stairs.x + (dx > 0 ? 1 : 0) : stairs.z + (dz > 0 ? 1 : 0)
                const corners = dx
                    ? [v(plane, -H, stairs.z), v(plane, -H, stairs.z + 1), v(plane, 0, stairs.z + 1), v(plane, 0, stairs.z)]
                    : [v(stairs.x, -H, plane), v(stairs.x + 1, -H, plane), v(stairs.x + 1, 0, plane), v(stairs.x, 0, plane)]
                pit.add(corners, v(-dx, 0, -dz), corners.map((point) => [(dx ? point.z : point.x) / size, point.y / size]) as [number, number][])
            }
            add(pit.mesh(materials.brick))
            const glow = new THREE.Object3D()
            glow.position.set(stairs.x + 0.5, -1, stairs.z + 0.5)
            glow.userData.light = {intensity: 2, color: 0xff9a45}
            add(glow)
            lights.push(glow)
        }
    }

    for (const room of ROOMS.filter((candidate) => candidate.floor === floor)) decorateRoom(room, materials, add)

    for (const prop of PROPS.filter((candidate) => candidate.floor === floor)) {
        const width = prop.width ?? 1, depth = prop.depth ?? 1
        // Le râtelier est tourné : sa longueur suit l'axe z.
        const object = buildProp(prop.kind, materials, prop.rotation ? depth : width, prop.rotation ? width : depth)
        object.position.set(prop.x + width / 2, 0, prop.z + depth / 2)
        object.rotation.y = prop.rotation ?? faceRoom(prop)
        // Les piliers prennent le revêtement de leur salle : marbre dans les salles de marbre.
        const theme = ROOM_THEMES[roomAt(prop)?.id ?? 'hall']
        if (prop.kind === 'pillar' && theme.walls === 'marble') {
            const marble = materials.wall('marble', theme.tint)
            object.traverse((child) => { if (child instanceof THREE.Mesh && child.material === materials.brick) child.material = marble })
        }
        add(object)
    }

    group.traverse((object) => {
        if (object.userData.light) lights.push(object)
        if (object.userData.flame) flames.push(object)
    })
    return {group, lights: [...new Set(lights)], flames}
}

/** Les meubles regardent +z ; adossé au mur sud, un meuble est retourné vers le nord (vers l'intérieur de la pièce). */
function faceRoom(tile: Tile) {
    const room = roomAt(tile)
    if (room && tile.z === room.z + room.depth - 1) return Math.PI
    return 0
}

/** Torches, bannières, fenêtres, tapis et poutres d'une pièce. */
function decorateRoom(room: CastleRoom, materials: CastleMaterials, add: (object: THREE.Object3D) => THREE.Object3D) {
    const {floor} = room
    const occupied = (x: number, z: number) => ['blocked', 'door', 'stairs', 'exit'].includes(tileAt({floor, x, z}))
        || DOORS.some((door) => door.floor === floor && Math.abs(door.x - x) + Math.abs(door.z - z) === 1)
    const ceremonial = ['hall', 'throne', 'chapel', 'gallery', 'antechamber'].includes(room.id)
    let wallIndex = 0
    // Parcours des faces de mur intérieures de la pièce : nord, sud, ouest, est.
    const faces: {x: number; z: number; dx: number; dz: number}[] = []
    for (let x = room.x; x < room.x + room.width; x++) faces.push({x, z: room.z, dx: 0, dz: -1}, {x, z: room.z + room.depth - 1, dx: 0, dz: 1})
    for (let z = room.z; z < room.z + room.depth; z++) faces.push({x: room.x, z, dx: -1, dz: 0}, {x: room.x + room.width - 1, z, dx: 1, dz: 0})
    for (const face of faces) {
        if (walkable({floor, x: face.x + face.dx, z: face.z + face.dz}) || occupied(face.x, face.z)) continue
        wallIndex++
        const exterior = face.x + face.dx <= 0 || face.x + face.dx >= FLOOR_WIDTH - 1 || face.z + face.dz <= 0 || face.z + face.dz >= FLOOR_DEPTH - 1
        // Position sur le mur, au milieu de la case, tournée vers la pièce.
        const anchor = new THREE.Group()
        anchor.position.set(face.x + 0.5 + face.dx * 0.5, 0, face.z + 0.5 + face.dz * 0.5)
        anchor.rotation.y = Math.atan2(-face.dx, -face.dz)
        const slot = (face.x * 7 + face.z * 3) % 5
        if (slot === 0) {
            const torch = wallTorch(materials)
            torch.position.y = 2
            anchor.add(torch)
        } else if (exterior && slot === 2) {
            anchor.add(windowPane(materials, room.id === 'throne'))
        } else if (ceremonial && slot === 3) {
            const flag = banner(materials)
            flag.position.y = 3.2
            anchor.add(flag)
        } else if ((room.id === 'gallery' && slot !== 4) || (PORTRAIT_ROOMS.includes(room.id) && slot === 4)) {
            anchor.add(portraitFrame(materials, wallIndex))
        } else {
            continue
        }
        add(anchor)
    }
    if (room.id === 'chapel') {
        // Rosace au-dessus de l'autel, sur le mur nord.
        const glass = new THREE.Group()
        glass.position.set(5.5, 0, room.z)
        glass.add(stainedWindow())
        add(glass)
    }

    if (room.carpet) {
        const alongX = room.carpet === 'x'
        const length = (alongX ? room.width : room.depth) - 1, width = 1.6
        const carpet = new THREE.Mesh(texturedBox(alongX ? length : width, 0.02, alongX ? width : length, TEXTURE_SIZE.velvet), materials.velvet)
        carpet.position.set(room.x + room.width / 2, 0.011, room.z + room.depth / 2)
        carpet.receiveShadow = true
        add(carpet)
        for (const side of [-1, 1]) {
            const trim = new THREE.Mesh(new THREE.BoxGeometry(alongX ? length : 0.06, 0.025, alongX ? 0.06 : length), materials.gold)
            trim.position.set(carpet.position.x + (alongX ? 0 : side * width / 2), 0.012, carpet.position.z + (alongX ? side * width / 2 : 0))
            add(trim)
        }
    }

    // Poutres du plafond, en travers de la pièce.
    for (let z = room.z + 1.5; z < room.z + room.depth; z += 2.5) {
        const beam = new THREE.Mesh(texturedBox(room.width, 0.3, 0.24, TEXTURE_SIZE.wood), materials.wood)
        beam.position.set(room.x + room.width / 2, H - 0.15, z)
        beam.castShadow = true
        add(beam)
    }

    // Lustre au centre des grandes salles : il porte la lumière d'ambiance de la pièce (voir castleMode.ts).
    if (ROOM_THEMES[room.id]?.chandelier) {
        const light = chandelier(materials)
        // Assez haut pour passer au-dessus de la caméra (2,4 m) : il ne masque pas le haut de l'image.
        light.position.set(room.x + room.width / 2, H - 0.85, room.z + room.depth / 2)
        add(light)
    }
}

/** Point où placer l'éclairage d'ambiance d'une pièce : son centre, sous le plafond. */
export function roomLightPosition(room: CastleRoom) {
    return new THREE.Vector3(room.x + room.width / 2, H - 0.9, room.z + room.depth / 2)
}

function windowPane(materials: CastleMaterials, tall: boolean) {
    const group = new THREE.Group()
    const height = tall ? 2.4 : 1.3, bottom = tall ? 0.8 : 1.4
    // Ciel du dehors à travers le verre : lumineux mais bleuté, sans brûler en blanc à l'exposition intérieure.
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, height), new THREE.MeshBasicMaterial({color: new THREE.Color(0.42, 0.58, 0.85)}))
    glass.position.set(0, bottom + height / 2, 0.01)
    group.add(glass)
    // Meneaux et appui en pierre.
    const place = (mesh: THREE.Mesh, y: number, z: number) => {
        mesh.position.set(0, y, z)
        group.add(mesh)
    }
    place(new THREE.Mesh(new THREE.BoxGeometry(0.06, height, 0.05), materials.iron), bottom + height / 2, 0.03)
    place(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), materials.iron), bottom + height * 0.6, 0.03)
    place(new THREE.Mesh(texturedBox(0.9, 0.1, 0.25, TEXTURE_SIZE.stoneFloor), materials.stoneFloor), bottom - 0.05, 0.1)
    const light = new THREE.Object3D()
    light.position.set(0, bottom + height / 2, 0.8)
    light.userData.light = {intensity: tall ? 4 : 2.5, color: 0xbcd4ff}
    group.add(light)
    return group
}

function stainedWindow() {
    const group = new THREE.Group()
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), new THREE.MeshBasicMaterial({map: stainedGlass(), color: new THREE.Color(2.2, 2.2, 2.2)}))
    glass.position.set(0, 2.55, 0.02)
    group.add(glass)
    const light = new THREE.Object3D()
    light.position.set(0, 2.2, 1.2)
    light.userData.light = {intensity: 5, color: 0xa86bff}
    group.add(light)
    return group
}

function portraitFrame(materials: CastleMaterials, seed: number) {
    const group = new THREE.Group()
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.82), new THREE.MeshStandardMaterial({map: portrait(seed), roughness: 0.8}))
    canvas.position.set(0, 1.85, 0.05)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.98, 0.06), materials.gold)
    frame.position.set(0, 1.85, 0.02)
    group.add(frame, canvas)
    return group
}

export function buildCastleInterior(materials: CastleMaterials): CastleInterior {
    const lockedDoors = new Map<string, THREE.Object3D>()
    const floors = [0, 1, 2].map((floor) => buildFloor(floor, materials, lockedDoors))
    const items = new Map<string, THREE.Object3D>()
    for (const item of ITEMS) {
        const mesh = itemMesh(item, materials)
        mesh.position.set(item.x + 0.5, 0.55, item.z + 0.5)
        floors[item.floor].group.add(mesh)
        floors[item.floor].lights.push(...mesh.children.filter((child) => child.userData.light))
        items.set(item.id, mesh)
    }
    const boss = createMewtwo()
    boss.root.position.set(BOSS.x + BOSS.width / 2, 0, BOSS.z + 0.5)
    floors[BOSS.floor].group.add(boss.root)
    floors[BOSS.floor].lights.push(...boss.root.children.filter((child) => child.userData.light))
    return {floors, lockedDoors, items, boss}
}
