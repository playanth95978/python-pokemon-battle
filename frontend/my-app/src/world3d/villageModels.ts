/**
 * Maisons de village en modèles 3D CC0 (Quaternius). Leurs matériaux unis reçoivent le grain des textures
 * Poly Haven (enduit, tuiles, bois) en projection triplanaire : pas besoin des UV du modèle.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Building } from '../world/types'

const MODELS = '/models/village'
const TEXTURES = '/textures/polyhaven'
/** Modèle par bâtiment de la carte ; un bâtiment inconnu prend le suivant dans la liste. */
const HOUSE_FOR: Record<string, string> = {
    'Maison du départ': 'fantasy_house_a',
    'Maison des soins': 'fantasy_inn',
    'Atelier du village': 'fantasy_house_b',
    'Chapelle': 'timber_house',
    'Forge': 'fantasy_house_b',
    'Ferme': 'fantasy_house_a',
    'Maison du garde': 'timber_house',
}
const HOUSES = ['fantasy_house_a', 'fantasy_inn', 'fantasy_house_b', 'timber_house']

/** Texture de détail d'après le nom du matériau du modèle, et sa taille de répétition en unités du monde. */
const DETAIL: [RegExp, string, number][] = [
    [/roof/i, 'clay_roof_tiles', 1.2],
    [/wood/i, 'wood_planks', 1.5],
    [/plaster|walls|beige|main|stone/i, 'plastered_wall_02', 2],
]

export interface VillageModels {
    /** Maison posée sur l'emprise du bâtiment, porte vers le sud (+z). */
    house(building: Building): THREE.Object3D
}

/** Multiplie la couleur du matériau par le grain de la texture (divisée par sa couleur moyenne), projeté sur les trois axes. */
function withDetail(material: THREE.MeshStandardMaterial, texture: THREE.Texture, scale: number) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.detailMap = {value: texture}
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPosition;\nvarying vec3 vDetailNormal;')
            .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
                vDetailPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vDetailNormal = normalize(mat3(modelMatrix) * objectNormal);`)
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

export async function loadVillageModels(renderer: THREE.WebGLRenderer): Promise<VillageModels> {
    const loader = new GLTFLoader(), textureLoader = new THREE.TextureLoader()
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
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
        return [name, {pivot, size: box.getSize(new THREE.Vector3())}] as const
    })))

    return {
        house(building) {
            const name = HOUSE_FOR[building.name] ?? HOUSES[(building.x + building.y) % HOUSES.length]
            const {pivot, size} = models.get(name)!
            const house = pivot.clone()
            // Même échelle sur les trois axes : la maison remplit l'emprise sans être déformée.
            const scale = Math.min((building.width - 0.2) / size.x, (building.height - 0.2) / size.z)
            house.scale.setScalar(scale)
            house.position.set(building.x + building.width / 2, 0, building.y + building.height / 2)
            return house
        },
    }
}
