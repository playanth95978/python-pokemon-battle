/**
 * Maisons de village en modèles 3D CC0 (Quaternius). Leurs matériaux unis reçoivent le grain des textures
 * Poly Haven (enduit, tuiles, bois) en projection triplanaire : pas besoin des UV du modèle.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Building, HouseModel } from '../world/types'
import { HOUSE_SIZE } from '../world/worldMap'
import { buildHouseInstances } from './houseInstances'

const MODELS = '/models/village'
const TEXTURES = '/textures/polyhaven'
const HOUSES = Object.keys(HOUSE_SIZE) as HouseModel[]
/** Texture de détail d'après le nom du matériau du modèle, et sa taille de répétition en unités du monde. */
const DETAIL: [RegExp, string, number][] = [
    [/roof/i, 'clay_roof_tiles', 1.2],
    [/wood/i, 'wood_planks', 1.5],
    [/plaster|walls|beige|main|stone/i, 'plastered_wall_02', 2],
]

export interface VillageModels {
    /** Maisons orientées vers leur rue, regroupées pour limiter les appels de rendu. */
    houses(buildings: readonly Building[]): THREE.Object3D
}

/** Multiplie la couleur du matériau par le grain de la texture (divisée par sa couleur moyenne), projeté sur les trois axes. */
function withDetail(material: THREE.MeshStandardMaterial, texture: THREE.Texture, scale: number) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.detailMap = {value: texture}
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPosition;\nvarying vec3 vDetailNormal;')
            .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
                vec4 detailPosition = vec4(transformed, 1.0);
                vec3 detailNormal = objectNormal;
                #ifdef USE_INSTANCING
                    detailPosition = instanceMatrix * detailPosition;
                    detailNormal = mat3(instanceMatrix) * detailNormal;
                #endif
                vDetailPosition = (modelMatrix * detailPosition).xyz;
                vDetailNormal = normalize(mat3(modelMatrix) * detailNormal);`)
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                uniform sampler2D detailMap;
                varying vec3 vDetailPosition;
                varying vec3 vDetailNormal;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
                vec3 weights = pow(abs(vDetailNormal), vec3(4.0));
                weights /= weights.x + weights.y + weights.z;
                vec3 position = vDetailPosition / ${scale.toFixed(2)};
                vec3 grain = texture(detailMap, position.zy).rgb * weights.x
                    + texture(detailMap, position.xz).rgb * weights.y
                    + texture(detailMap, position.xy).rgb * weights.z;
                vec3 average = max(textureLod(detailMap, vec2(0.5), 12.0).rgb, vec3(0.04));
                diffuseColor.rgb *= clamp(grain / average, 0.4, 1.8);`)
    }
    material.customProgramCacheKey = () => `detail-${scale}`
    material.roughness = Math.max(material.roughness, 0.85)
    material.metalness = 0
}

export async function loadVillageModels(renderer: THREE.WebGLRenderer, maxAnisotropy = 8): Promise<VillageModels> {
    const loader = new GLTFLoader(), textureLoader = new THREE.TextureLoader()
    const anisotropy = Math.min(maxAnisotropy, renderer.capabilities.getMaxAnisotropy())
    const textures = new Map<string, Promise<THREE.Texture>>()
    const detail = (file: string) => {
        if (!textures.has(file)) {
            textures.set(file, textureLoader.loadAsync(`${TEXTURES}/${file}_diff_1k.jpg`).then((texture) => {
                texture.colorSpace = THREE.SRGBColorSpace
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping
                texture.anisotropy = anisotropy
                return texture
            }))
        }
        return textures.get(file)!
    }
    const models = new Map(await Promise.all(HOUSES.map(async (name) => {
        const {scene} = await loader.loadAsync(`${MODELS}/${name}.glb`)
        const upgrades: Promise<void>[] = []
        scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return
            object.castShadow = true
            object.receiveShadow = true
            for (const material of [object.material].flat() as THREE.MeshStandardMaterial[]) {
                // Fenêtres éclairées de l'intérieur, comme les anciennes maisons.
                if (/window/i.test(material.name)) {
                    Object.assign(material, {emissive: new THREE.Color(0xffb54d), emissiveIntensity: 1.2, roughness: 0.25})
                    continue
                }
                const match = DETAIL.find(([pattern]) => pattern.test(material.name))
                if (match) upgrades.push(detail(match[1]).then((texture) => withDetail(material, texture, match[2])))
            }
        })
        await Promise.all(upgrades)
        // Modèle recentré, posé au sol : son emprise sert à l'adapter à celle du bâtiment.
        scene.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(scene)
        const center = box.getCenter(new THREE.Vector3())
        const pivot = new THREE.Group()
        scene.position.set(-center.x, -box.min.y, -center.z)
        pivot.add(scene)
        pivot.updateMatrixWorld(true)
        return [name, pivot] as const
    })))

    // Teintes de toit et d'enduit partagées : pas de matériau cloné par maison.
    const roofs = new Map<string, THREE.Material>()
    const tintFor = (material: THREE.MeshStandardMaterial, color: string) => {
        const key = `${material.uuid}:${color}`
        if (!roofs.has(key)) {
            const tinted = material.clone()
            tinted.color.set(color).lerp(new THREE.Color(0xffffff), 0.35)
            // clone() ne recopie pas le grain des tuiles (voir withDetail).
            tinted.onBeforeCompile = material.onBeforeCompile
            tinted.customProgramCacheKey = material.customProgramCacheKey
            roofs.set(key, tinted)
        }
        return roofs.get(key)!
    }

    return {houses: (buildings) => buildHouseInstances(buildings, models, (material, building) => {
        const color = /roof/i.test(material.name) ? building.roof
            : /plaster|walls|beige|main|stone/i.test(material.name) ? building.facade : undefined
        return color && material instanceof THREE.MeshStandardMaterial ? tintFor(material, color) : material
    })}
}
