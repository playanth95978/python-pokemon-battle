/** Matériaux partagés du monde 3D : affichés tout de suite en couleur unie, texturés dès que les images arrivent. */
import * as THREE from 'three'
import type { WorldMap } from '../world/types'
import { tileAt } from '../world/worldMap'

const TEXTURES = '/textures/polyhaven'
/** Une texture de sol couvre 4 × 4 cases. */
export const GROUND_TILE = 4

export interface WorldMaterials {
    ground: THREE.MeshStandardMaterial
    blade: THREE.MeshStandardMaterial
    flower: THREE.MeshStandardMaterial
    foliage: THREE.MeshStandardMaterial
    bark: THREE.MeshStandardMaterial
    plaster: THREE.MeshStandardMaterial
    wood: THREE.MeshStandardMaterial
    stone: THREE.MeshStandardMaterial
    glass: THREE.MeshStandardMaterial
    water: THREE.MeshPhysicalMaterial
    roof: (color: string) => THREE.MeshStandardMaterial
    /** Temps partagé par les shaders animés (vent). */
    time: { value: number }
    /** Résolu quand toutes les textures sont appliquées (ou ont échoué). */
    ready: Promise<void>
    progress: () => number
}

function solid(color: string) {
    const hex = new THREE.Color(color).getHex()
    const texture = new THREE.DataTexture(new Uint8Array([hex >> 16 & 255, hex >> 8 & 255, hex & 255, 255]), 1, 1)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    return texture
}

/** Masque par case : rouge = chemin, vert = sous-bois, bleu = lit du lac. Filtré linéairement pour adoucir les bords. */
function splatTexture(map: WorldMap) {
    const data = new Uint8Array(map.width * map.height * 4)
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const tile = tileAt(map, {x, y})
            const offset = (y * map.width + x) * 4
            data[offset] = tile === 'path' || tile === 'bridge' || tile === 'wall' ? 255 : 0
            data[offset + 1] = tile === 'tree' ? 255 : 0
            data[offset + 2] = tile === 'water' ? 255 : 0
            data[offset + 3] = 255
        }
    }
    const texture = new THREE.DataTexture(data, map.width, map.height)
    texture.magFilter = texture.minFilter = THREE.LinearFilter
    texture.needsUpdate = true
    return texture
}

function groundMaterial(map: WorldMap, path: { value: THREE.Texture }) {
    const material = new THREE.MeshStandardMaterial({map: solid('#5f8a45'), roughness: 1})
    const splat = splatTexture(map)
    // Mélange herbe/chemin par case, avec un bruit tiré de la texture pour casser la grille.
    material.onBeforeCompile = (shader) => {
        shader.uniforms.pathMap = path
        shader.uniforms.splatMap = {value: splat}
        shader.uniforms.splatSize = {value: new THREE.Vector2(map.width, map.height)}
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                uniform sampler2D pathMap;
                uniform sampler2D splatMap;
                uniform vec2 splatSize;`)
            .replace('#include <map_fragment>', `
                vec2 worldXZ = vMapUv * ${GROUND_TILE.toFixed(1)};
                vec4 grassTexel = texture2D(map, vMapUv);
                vec4 pathTexel = texture2D(pathMap, vMapUv);
                vec3 splat = texture2D(splatMap, worldXZ / splatSize).rgb;
                float breakup = texture2D(pathMap, vMapUv * 0.37).g - 0.4;
                float pathMask = smoothstep(0.35, 0.65, splat.r + breakup * 0.6);
                vec4 groundTexel = mix(grassTexel, pathTexel, max(pathMask, splat.b));
                groundTexel.rgb *= 1.0 - splat.g * 0.45 - splat.b * 0.35;
                diffuseColor *= groundTexel;`)
    }
    return material
}

export function createWorldMaterials(map: WorldMap, renderer: THREE.WebGLRenderer): WorldMaterials {
    const loader = new THREE.TextureLoader()
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    let loaded = 0, total = 0
    const pending: Promise<unknown>[] = []

    function load(file: string, color: boolean, repeat: number) {
        total++
        const promise = loader.loadAsync(`${TEXTURES}/${file}_1k.jpg`).then((texture) => {
            texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping
            texture.repeat.set(repeat, repeat)
            texture.anisotropy = anisotropy
            return texture
        }).finally(() => { loaded++ })
        pending.push(promise.catch(() => null))
        return promise
    }

    /** Applique couleur, normales et rugosité sur des matériaux existants, sans changer leurs références. */
    function pbr(name: string, materials: THREE.MeshStandardMaterial[], repeat = 1, normalScale = 1) {
        void Promise.all([load(`${name}_diff`, true, repeat), load(`${name}_nor_gl`, false, repeat), load(`${name}_rough`, false, repeat)])
            .then(([diffuse, normal, rough]) => {
                for (const material of materials) {
                    material.map = diffuse
                    material.normalMap = normal
                    material.normalScale.setScalar(normalScale)
                    material.roughnessMap = rough
                    material.needsUpdate = true
                }
            })
            .catch(() => undefined)
    }

    const time = {value: 0}
    const path = {value: solid('#b39a6e') as THREE.Texture}
    const ground = groundMaterial(map, path)
    // Terre clairsemée pour les chemins, sous-bois moussu pour l'herbe.
    void load('sparse_grass_diff', true, 1).then((texture) => { path.value = texture }).catch(() => undefined)
    void Promise.all([load('forrest_ground_01_diff', true, 1), load('forrest_ground_01_nor_gl', false, 1)]).then(([diffuse, normal]) => {
        ground.map = diffuse
        ground.normalMap = normal
        ground.needsUpdate = true
    }).catch(() => undefined)

    // Brins en ruban vus des deux côtés ; leur dégradé de sommet assombrit le pied de la touffe.
    const blade = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1, envMapIntensity: 0.15, vertexColors: true, side: THREE.DoubleSide})
    // Vent : le haut des brins oscille, la base reste fixe.
    blade.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = time
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vec4 root = instanceMatrix[3];
                transformed.x += sin(uTime * 1.8 + root.x * 0.6 + root.z * 0.4) * 0.35 * position.y;
                transformed.z += cos(uTime * 1.3 + root.x * 0.3) * 0.15 * position.y;`)
    }

    const plaster = new THREE.MeshStandardMaterial({color: 0xf1e6d2, roughness: 0.9, envMapIntensity: 0.3})
    const wood = new THREE.MeshStandardMaterial({color: 0x8a5a36, roughness: 0.85})
    const bark = new THREE.MeshStandardMaterial({color: 0x6b4a33, roughness: 1})
    const roofs = new Map<string, THREE.MeshStandardMaterial>()
    // Une seule série d'images pour tous les toits ; seule la teinte change par maison.
    const roofTextures = Promise.all([load('clay_roof_tiles_diff', true, 0.5), load('clay_roof_tiles_nor_gl', false, 0.5), load('clay_roof_tiles_rough', false, 0.5)])
    function roof(color: string) {
        const existing = roofs.get(color)
        if (existing) return existing
        const material = new THREE.MeshStandardMaterial({color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45), roughness: 0.8})
        void roofTextures.then(([diffuse, normal, rough]) => {
            Object.assign(material, {map: diffuse, normalMap: normal, roughnessMap: rough})
            material.needsUpdate = true
        }).catch(() => undefined)
        roofs.set(color, material)
        return material
    }
    pbr('plastered_wall_02', [plaster], 0.5)
    pbr('wood_planks', [wood], 1)
    pbr('bark_willow', [bark], 1, 1.5)

    return {
        ground, blade, plaster, wood, bark, roof, time,
        flower: new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.6}),
        foliage: new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.9, flatShading: true}),
        stone: new THREE.MeshStandardMaterial({color: 0x8d877d, roughness: 1}),
        glass: new THREE.MeshStandardMaterial({color: 0xffe2a3, emissive: 0xffb54d, emissiveIntensity: 1.6, roughness: 0.2}),
        water: new THREE.MeshPhysicalMaterial({
            color: 0x2f7f9c, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.82,
            clearcoat: 1, clearcoatRoughness: 0.1,
        }),
        ready: Promise.all(pending).then(() => undefined),
        progress: () => total ? loaded / total : 1,
    }
}
