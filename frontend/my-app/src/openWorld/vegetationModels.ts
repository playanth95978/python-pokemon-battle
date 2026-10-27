/** Modèles low-poly de la végétation : une géométrie fusionnée par espèce, en version proche et lointaine. */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createGrassBlade } from '../world3d/grassBlade'
import type { Species } from './vegetation'

type Part = [THREE.BufferGeometry, number, (geometry: THREE.BufferGeometry) => void]

/** Fusionne des primitives colorées en une seule géométrie : un seul appel de dessin par espèce. */
function model(parts: Part[]) {
    const color = new THREE.Color()
    const geometries = parts.map(([source, hex, place]) => {
        const geometry = source.index ? source.toNonIndexed() : source
        geometry.deleteAttribute('uv')
        place(geometry)
        color.setHex(hex)
        const colors = new Float32Array(geometry.attributes.position.count * 3)
        for (let index = 0; index < colors.length; index += 3) colors.set([color.r, color.g, color.b], index)
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        return geometry
    })
    const merged = mergeGeometries(geometries)!
    merged.computeVertexNormals()
    merged.computeBoundingSphere()
    return merged
}

const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => (geometry: THREE.BufferGeometry) => {
    geometry.scale(sx, sy, sz)
    if (rx) geometry.rotateX(rx)
    if (rz) geometry.rotateZ(rz)
    geometry.translate(x, y, z)
}

const BARK = 0x5d4030, LEAF = 0x3f7a32, DARK_LEAF = 0x2a5a2e, NEEDLE = 0x24502f, SNOW = 0xeef3f6

function trunk(height: number, radius = 0.15, segments = 6): Part {
    return [new THREE.CylinderGeometry(radius * 0.7, radius, height, segments), BARK, at(0, height / 2, 0)]
}

function palmFronds(): Part[] {
    return Array.from({length: 6}, (_, index) => {
        const angle = index / 6 * Math.PI * 2
        return [new THREE.ConeGeometry(0.16, 1.5, 3), 0x4c8a35, (geometry: THREE.BufferGeometry) => {
            geometry.translate(0, 0.75, 0)
            geometry.scale(1, 1, 0.3)
            geometry.rotateZ(-1.9)
            geometry.rotateY(angle)
            geometry.translate(0.25, 2.75, 0)
        }] as Part
    })
}

const NEAR: Record<Species, () => THREE.BufferGeometry> = {
    oak: () => model([trunk(1.5, 0.18), [new THREE.IcosahedronGeometry(0.95, 1), LEAF, at(0, 2.1, 0, 1, 0.85, 1)],
        [new THREE.IcosahedronGeometry(0.6, 0), LEAF, at(0.45, 2.6, 0.2)]]),
    pine: () => model([trunk(1.1, 0.14, 5), [new THREE.ConeGeometry(0.95, 1.5, 7), NEEDLE, at(0, 1.5, 0)],
        [new THREE.ConeGeometry(0.72, 1.25, 7), NEEDLE, at(0, 2.2, 0)], [new THREE.ConeGeometry(0.45, 1, 7), NEEDLE, at(0, 2.85, 0)]]),
    snowPine: () => model([trunk(1.1, 0.14, 5), [new THREE.ConeGeometry(0.95, 1.5, 7), NEEDLE, at(0, 1.5, 0)],
        [new THREE.ConeGeometry(0.72, 1.25, 7), SNOW, at(0, 2.2, 0)], [new THREE.ConeGeometry(0.45, 1, 7), SNOW, at(0, 2.85, 0)]]),
    willow: () => model([trunk(1.3, 0.24), [new THREE.IcosahedronGeometry(1, 1), 0x56702f, at(0, 1.9, 0, 1.4, 0.75, 1.4)],
        [new THREE.CylinderGeometry(1.25, 1.45, 0.9, 9, 1, true), 0x4d6629, at(0, 1.35, 0)]]),
    palm: () => model([[new THREE.CylinderGeometry(0.08, 0.13, 2.8, 6), 0x8a6a45, at(0.12, 1.4, 0, 1, 1, 1, 0, -0.09)], ...palmFronds()]),
    cactus: () => model([[new THREE.CapsuleGeometry(0.17, 1.2, 3, 7), 0x4f7d3a, at(0, 0.75, 0)],
        [new THREE.CapsuleGeometry(0.1, 0.45, 3, 6), 0x4f7d3a, at(0.28, 0.95, 0)], [new THREE.CapsuleGeometry(0.1, 0.35, 3, 6), 0x4f7d3a, at(-0.27, 0.75, 0)],
        [new THREE.CylinderGeometry(0.1, 0.1, 0.2, 6), 0x4f7d3a, at(0.18, 0.72, 0, 1, 1, 1, 0, Math.PI / 2)],
        [new THREE.CylinderGeometry(0.1, 0.1, 0.2, 6), 0x4f7d3a, at(-0.17, 0.55, 0, 1, 1, 1, 0, Math.PI / 2)]]),
    bush: () => model([[new THREE.IcosahedronGeometry(0.42, 0), DARK_LEAF, at(0, 0.25, 0, 1.1, 0.7, 1)],
        [new THREE.IcosahedronGeometry(0.3, 0), LEAF, at(0.25, 0.32, 0.1)]]),
    deadBush: () => model([0, 1, 2, 3].map((index) =>
        [new THREE.CylinderGeometry(0.015, 0.03, 0.55, 3), 0x8b6d4a, at(Math.cos(index * 1.7) * 0.08, 0.22, Math.sin(index * 1.7) * 0.08, 1, 1, 1, Math.cos(index * 2.1) * 0.5, Math.sin(index * 2.1) * 0.5)] as Part)),
    reed: () => model([0, 1, 2, 3, 4].map((index) =>
        [new THREE.ConeGeometry(0.03, 1.1, 3), 0x7f8a45, at(Math.cos(index * 1.3) * 0.12, 0.55, Math.sin(index * 1.3) * 0.12, 1, 1, 1, Math.cos(index) * 0.12, Math.sin(index) * 0.12)] as Part)),
    rock: () => model([[new THREE.DodecahedronGeometry(0.55, 0), 0x77736c, at(0, 0.15, 0, 1, 0.6, 0.85)],
        [new THREE.DodecahedronGeometry(0.3, 0), 0x6b675f, at(0.4, 0.05, 0.25, 1, 0.7, 1)]]),
}

/** Versions lointaines : quelques triangles, mêmes silhouettes et couleurs. */
const FAR: Partial<Record<Species, () => THREE.BufferGeometry>> = {
    oak: () => model([trunk(1.5, 0.18, 3), [new THREE.IcosahedronGeometry(1, 0), LEAF, at(0, 2.2, 0, 1.05, 0.9, 1.05)]]),
    pine: () => model([trunk(1.1, 0.14, 3), [new THREE.ConeGeometry(0.95, 2.7, 5), NEEDLE, at(0, 2.1, 0)]]),
    snowPine: () => model([trunk(1.1, 0.14, 3), [new THREE.ConeGeometry(0.95, 2.7, 5), 0xc9d6d2, at(0, 2.1, 0)]]),
    willow: () => model([trunk(1.3, 0.24, 3), [new THREE.IcosahedronGeometry(1, 0), 0x56702f, at(0, 1.8, 0, 1.4, 0.85, 1.4)]]),
    palm: () => model([[new THREE.CylinderGeometry(0.08, 0.13, 2.8, 3), 0x8a6a45, at(0, 1.4, 0)],
        [new THREE.IcosahedronGeometry(0.8, 0), 0x4c8a35, at(0, 2.8, 0, 1.2, 0.35, 1.2)]]),
    cactus: () => model([[new THREE.CylinderGeometry(0.17, 0.17, 1.5, 5), 0x4f7d3a, at(0, 0.75, 0)]]),
}

const cache = new Map<string, THREE.BufferGeometry>()

/** Géométrie partagée par toutes les instances de l'espèce (jamais libérée). */
export function speciesGeometry(species: Species, far: boolean) {
    const key = `${species}:${far}`
    let geometry = cache.get(key)
    if (!geometry) {
        geometry = (far ? FAR[species] ?? NEAR[species] : NEAR[species])()
        cache.set(key, geometry)
    }
    return geometry
}

/** Brin d'herbe courbé, base au sol ; sa teinte vient de chaque instance. */
export const grassBlade = createGrassBlade(0.42, 0.07)

/** Matériau des plantes avec vent : le haut oscille, la base reste ancrée. `strength` en unités par unité de hauteur. */
export function windMaterial(time: { value: number }, strength: number) {
    const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.9, flatShading: true, envMapIntensity: 0.3})
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = time
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vec4 root = instanceMatrix[3];
                float sway = position.y * position.y * ${strength.toFixed(3)};
                transformed.x += sin(uTime * 1.6 + root.x * 0.35 + root.z * 0.2) * sway;
                transformed.z += cos(uTime * 1.1 + root.x * 0.2) * sway * 0.5;`)
    }
    return material
}
