/**
 * Reflets des sols du château : chaque étage est dessiné à hauteur 0, donc un seul miroir plan suffit. La scène est
 * rendue une fois par image, vue d'en dessous, en demi-résolution (la caméra miroir et le plan de coupe oblique sont
 * ceux du Reflector de three.js) ; les matériaux de sol y lisent leur reflet, plus ou moins net selon leur rugosité et
 * plus fort en vue rasante (Fresnel). Exact pour un sol plat, contrairement aux reflets en espace écran (SSR) qui
 * disparaissent au bord de l'image ou derrière les objets.
 */
import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import type { RoomStyle } from './castleLayout'

/** Part de reflet de chaque sol : marbre poli, parquet ciré, dalles de pierre à peine luisantes. */
export const REFLECTIVITY: Record<RoomStyle, number> = {marble: 0.42, wood: 0.18, stone: 0.08}

export function createFloorReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2())
    // Le Reflector ne sert que pour sa caméra miroir et sa cible : il n'est pas dans la scène, on le déclenche à la main.
    const mirror = new Reflector(new THREE.PlaneGeometry(1, 1), {
        textureWidth: Math.max(1, buffer.x / 2), textureHeight: Math.max(1, buffer.y / 2), clipBias: 0.002, multisample: 0,
    })
    mirror.rotation.x = -Math.PI / 2
    mirror.updateMatrixWorld()
    const textureMatrix = (mirror.material as THREE.ShaderMaterial).uniforms.textureMatrix.value as THREE.Matrix4
    const fromWorld = mirror.matrixWorld.clone().invert()
    // Sols qui lisent le miroir : masqués pendant son rendu (une texture ne peut pas être lue et écrite à la fois).
    let floors: THREE.Object3D[] | null = null
    // Copies des matériaux de sol et leur original, dont les textures arrivent après coup (chargement asynchrone).
    const copies: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial][] = []
    // Partagés par tous les sols : projection du reflet (depuis les coordonnées monde) et image miroir.
    const uniforms = {
        reflectMatrix: {value: new THREE.Matrix4()},
        reflectionMap: {value: mirror.getRenderTarget().texture},
    }

    return {
        /** Copie d'un matériau de sol qui reçoit le reflet (les murs et meubles gardent le matériau d'origine). */
        floorMaterial(base: THREE.MeshStandardMaterial, style: RoomStyle) {
            const material = base.clone()
            material.onBeforeCompile = (shader) => {
                Object.assign(shader.uniforms, uniforms, {floorReflectivity: {value: REFLECTIVITY[style]}})
                shader.vertexShader = shader.vertexShader
                    .replace('#include <common>', '#include <common>\nuniform mat4 reflectMatrix;\nvarying vec4 vReflectCoord;')
                    .replace('#include <fog_vertex>', '#include <fog_vertex>\nvReflectCoord = reflectMatrix * modelMatrix * vec4(transformed, 1.0);')
                shader.fragmentShader = shader.fragmentShader
                    .replace('#include <common>', '#include <common>\nuniform sampler2D reflectionMap;\nuniform float floorReflectivity;\nvarying vec4 vReflectCoord;')
                    .replace('#include <opaque_fragment>', `
                        // Le relief de la texture trouble un peu le reflet ; la rugosité l'étale (cinq échantillons).
                        vec2 reflectUv = vReflectCoord.xy / vReflectCoord.w + normal.xy * 0.015;
                        float spread = roughnessFactor * 0.012;
                        vec3 reflected = texture2D(reflectionMap, reflectUv).rgb * 0.4
                            + texture2D(reflectionMap, reflectUv + vec2(spread, 0.0)).rgb * 0.15
                            + texture2D(reflectionMap, reflectUv - vec2(spread, 0.0)).rgb * 0.15
                            + texture2D(reflectionMap, reflectUv + vec2(0.0, spread)).rgb * 0.15
                            + texture2D(reflectionMap, reflectUv - vec2(0.0, spread)).rgb * 0.15;
                        float facing = saturate(dot(normalize(vViewPosition), normal));
                        float fresnel = mix(0.35, 1.0, pow(1.0 - facing, 4.0));
                        outgoingLight = mix(outgoingLight, reflected, floorReflectivity * fresnel);
                        #include <opaque_fragment>`)
            }
            // Clé de cache propre : sans elle, three.js réutiliserait le programme du matériau d'origine.
            material.customProgramCacheKey = () => `castle-floor-reflection-${style}`
            material.userData.reflectiveFloor = true
            copies.push([material, base])
            return material
        },
        /** À appeler avant le rendu de l'image : rend le miroir pour cette caméra. */
        update(camera: THREE.PerspectiveCamera) {
            renderer.getDrawingBufferSize(buffer)
            const target = mirror.getRenderTarget()
            const width = Math.max(1, Math.floor(buffer.x / 2)), height = Math.max(1, Math.floor(buffer.y / 2))
            if (target.width !== width || target.height !== height) target.setSize(width, height)
            for (const [copy, base] of copies) {
                if (copy.map === base.map && copy.normalMap === base.normalMap && copy.roughnessMap === base.roughnessMap) continue
                Object.assign(copy, {map: base.map, normalMap: base.normalMap, roughnessMap: base.roughnessMap})
                copy.needsUpdate = true
            }
            floors ??= collectFloors(scene)
            const shown = floors.map((floor) => floor.visible)
            floors.forEach((floor) => { floor.visible = false })
            mirror.onBeforeRender(renderer, scene, camera, mirror.geometry, mirror.material as THREE.Material, null as unknown as THREE.Group)
            floors.forEach((floor, index) => { floor.visible = shown[index] })
            uniforms.reflectMatrix.value.multiplyMatrices(textureMatrix, fromWorld)
        },
    }
}

function collectFloors(scene: THREE.Scene) {
    const floors: THREE.Object3D[] = []
    scene.traverse((object) => {
        if ((object as THREE.Mesh).isMesh && ((object as THREE.Mesh).material as THREE.Material).userData?.reflectiveFloor) floors.push(object)
    })
    return floors
}
