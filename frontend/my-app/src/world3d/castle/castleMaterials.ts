/**
 * Matériaux PBR 2K du château (Poly Haven, CC0) : couleur, normales et rugosité. Les géométries portent des UV
 * en unités du monde divisées par la taille d'une répétition : la texture reste continue d'un mur à l'autre.
 */
import * as THREE from 'three'

const TEXTURES = '/textures/polyhaven'

export interface CastleMaterials {
    rampart: THREE.MeshStandardMaterial
    /** Ardoise des toits : la pierre des remparts, assombrie et bleutée. */
    roof: THREE.MeshStandardMaterial
    brick: THREE.MeshStandardMaterial
    stoneFloor: THREE.MeshStandardMaterial
    marble: THREE.MeshStandardMaterial
    wood: THREE.MeshStandardMaterial
    velvet: THREE.MeshStandardMaterial
    gold: THREE.MeshStandardMaterial
    iron: THREE.MeshStandardMaterial
    /**
     * Revêtement mural teinté : chaque pièce a le sien (briques, enduit, boiseries, marbre). Les textures sont
     * partagées entre toutes les teintes : une seule copie de chaque image en mémoire graphique.
     */
    wall: (kind: WallKind, tint: THREE.ColorRepresentation) => THREE.MeshStandardMaterial
    /** Proportion de textures chargées, de 0 à 1. */
    progress: () => number
    ready: Promise<void>
}

export type WallKind = 'brick' | 'plaster' | 'wood' | 'marble'

/** Taille d'une répétition de chaque texture, en unités du monde (une case = 1). */
export const TEXTURE_SIZE = {rampart: 3, brick: 2.4, stoneFloor: 2.5, marble: 3, wood: 1.6, velvet: 1.2, plaster: 2.2}

const WALL_TEXTURES: Record<WallKind, [string, '1k' | '2k']> = {
    brick: ['castle_brick_07', '2k'],
    plaster: ['plastered_wall_02', '1k'],
    wood: ['medieval_wood', '2k'],
    marble: ['marble_01', '2k'],
}

export function createCastleMaterials(renderer: THREE.WebGLRenderer): CastleMaterials {
    const loader = new THREE.TextureLoader()
    const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
    let loaded = 0, total = 0
    const textures = new Map<string, Promise<THREE.Texture | null>>()
    const texture = (file: string, color: boolean) => {
        if (!textures.has(file)) {
            total++
            textures.set(file, loader.loadAsync(`${TEXTURES}/${file}`).then((loadedTexture) => {
                loadedTexture.wrapS = loadedTexture.wrapT = THREE.RepeatWrapping
                loadedTexture.anisotropy = anisotropy
                if (color) loadedTexture.colorSpace = THREE.SRGBColorSpace
                loaded++
                return loadedTexture
            }).catch(() => null))
        }
        return textures.get(file)!
    }
    const pbr = (name: string, options: THREE.MeshStandardMaterialParameters = {}, resolution: '1k' | '2k' = '2k') => {
        const material = new THREE.MeshStandardMaterial({roughness: 1, ...options})
        for (const [slot, suffix, color] of [['map', 'diff', true], ['normalMap', 'nor_gl', false], ['roughnessMap', 'rough', false]] as const) {
            void texture(`${name}_${suffix}_${resolution}.jpg`, color).then((shared) => {
                if (!shared) return
                material[slot] = shared
                material.needsUpdate = true
            })
        }
        return material
    }
    const walls = new Map<string, THREE.MeshStandardMaterial>()
    return {
        rampart: pbr('castle_wall_slates'),
        roof: pbr('castle_wall_slates', {color: 0x56607a}),
        brick: pbr('castle_brick_07', {color: 0xd8cfc4}),
        stoneFloor: pbr('monastery_stone_floor'),
        marble: pbr('marble_01', {color: 0xc8c2b8, roughness: 0.6, envMapIntensity: 1.4}),
        wood: pbr('medieval_wood'),
        // Velours teinté pourpre profond : tapis, tentures, coussins du trône.
        velvet: pbr('velour_velvet', {color: 0x5e0f22}),
        gold: new THREE.MeshStandardMaterial({color: 0xd4a437, metalness: 1, roughness: 0.28}),
        iron: new THREE.MeshStandardMaterial({color: 0x3b3d42, metalness: 0.85, roughness: 0.45}),
        wall(kind, tint) {
            const key = `${kind}:${new THREE.Color(tint).getHexString()}`
            if (!walls.has(key)) {
                const [name, resolution] = WALL_TEXTURES[kind]
                walls.set(key, pbr(name, {color: tint, ...(kind === 'marble' ? {roughness: 0.6, envMapIntensity: 1.2} : {})}, resolution))
            }
            return walls.get(key)!
        },
        progress: () => total ? loaded / total : 1,
        get ready() {
            return Promise.all(textures.values()).then(() => undefined)
        },
    }
}

/**
 * Boîte dont chaque face reçoit des UV à l'échelle du monde (`size` unités par répétition) :
 * une poutre longue ou un mur épais ne voient pas leur texture étirée.
 */
export function texturedBox(width: number, height: number, depth: number, size: number) {
    const geometry = new THREE.BoxGeometry(width, height, depth)
    const normals = geometry.attributes.normal, uvs = geometry.attributes.uv
    for (let index = 0; index < uvs.count; index++) {
        const [u, v] = Math.abs(normals.getX(index)) > 0.5 ? [depth, height]
            : Math.abs(normals.getY(index)) > 0.5 ? [width, depth] : [width, height]
        uvs.setXY(index, uvs.getX(index) * u / size, uvs.getY(index) * v / size)
    }
    return geometry
}

/** Cylindre (tour, pilier, tonneau) : la texture fait le tour à l'échelle du monde. */
export function texturedCylinder(radiusTop: number, radiusBottom: number, height: number, segments: number, size: number, open = false) {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, open)
    const uvs = geometry.attributes.uv
    const around = Math.PI * 2 * Math.max(radiusTop, radiusBottom) / size
    for (let index = 0; index < uvs.count; index++) uvs.setXY(index, uvs.getX(index) * around, uvs.getY(index) * height / size)
    return geometry
}
