/**
 * Mobilier du bourg (fontaine, étals, lanternes, barrières…), construit en code : aucun modèle à télécharger.
 * Tout le mobilier d'un chunk de décor est fusionné en une géométrie par matériau : une centaine d'objets ne coûte
 * qu'une poignée d'appels de rendu.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Direction, Prop, PropKind } from '../world/types'
import { PROP_SIZE } from '../world/worldMap'
import type { WorldMaterials } from './worldMaterials'

/** Lumière des lanternes : elles s'allument le soir (voir dayCycle.ts). */
export const lanternGlass = new THREE.MeshStandardMaterial({color: 0xffe2a3, emissive: 0xffb54d, emissiveIntensity: 0, roughness: 0.2})
const ANGLES: Record<Direction, number> = {down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2}

type Material = 'wood' | 'stone' | 'plaster' | 'roof' | 'glass' | 'water' | 'cloth' | 'clothLight' | 'hay' | 'iron' | 'leaf' | 'fruit'
type Part = [THREE.BufferGeometry, Material]

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const cylinder = (top: number, bottom: number, h: number, segments = 10) => new THREE.CylinderGeometry(top, bottom, h, segments)

/** Une pièce déplacée et tournée, son repère cuit dans la géométrie. */
function at(geometry: THREE.BufferGeometry, material: Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Part {
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)))
    return [geometry, material]
}

/** Pièces de chaque sorte, centrées sur leur emprise, posées au sol, l'avant vers +z. */
const SHAPES: Record<PropKind, () => Part[]> = {
    fountain: () => [
        at(cylinder(0.95, 1, 0.45, 20), 'stone', 0, 0.22, 0),
        at(cylinder(0.84, 0.84, 0.04, 20), 'water', 0, 0.4, 0),
        at(cylinder(0.13, 0.18, 1.1), 'stone', 0, 0.75, 0),
        at(cylinder(0.38, 0.16, 0.16, 16), 'stone', 0, 1.25, 0),
        at(cylinder(0.32, 0.32, 0.03, 16), 'water', 0, 1.32, 0),
        at(cylinder(0.05, 0.09, 0.3), 'stone', 0, 1.45, 0),
    ],
    well: () => [
        at(cylinder(0.42, 0.45, 0.6, 14), 'stone', 0, 0.3, 0),
        at(cylinder(0.34, 0.34, 0.02, 14), 'water', 0, 0.45, 0),
        at(box(0.08, 1.4, 0.08), 'wood', -0.4, 0.7, 0), at(box(0.08, 1.4, 0.08), 'wood', 0.4, 0.7, 0),
        at(cylinder(0.05, 0.05, 0.9, 6), 'wood', 0, 1.15, 0, 0, 0, Math.PI / 2),
        at(new THREE.ConeGeometry(0.7, 0.45, 4), 'roof', 0, 1.6, 0, 0, Math.PI / 4),
        at(box(0.16, 0.18, 0.16), 'wood', 0.1, 0.85, 0),
    ],
    stall: () => [
        at(box(0.92, 0.5, 0.42), 'wood', 0, 0.25, 0.18),
        at(box(0.06, 1.7, 0.06), 'wood', -0.43, 0.85, -0.3), at(box(0.06, 1.7, 0.06), 'wood', 0.43, 0.85, -0.3),
        at(box(0.06, 1.3, 0.06), 'wood', -0.43, 0.65, 0.36), at(box(0.06, 1.3, 0.06), 'wood', 0.43, 0.65, 0.36),
        at(box(1.04, 0.03, 0.42), 'cloth', 0, 1.55, -0.1, -0.5), at(box(1.04, 0.03, 0.42), 'clothLight', 0, 1.42, 0.24, -0.5),
        ...[-0.3, -0.1, 0.1, 0.3].map((x, index) => at(new THREE.SphereGeometry(0.07, 8, 6), index % 2 ? 'fruit' : 'leaf', x, 0.56, 0.18)),
        at(box(0.3, 0.12, 0.2), 'wood', 0.22, 0.56, 0.05),
    ],
    lantern: () => [
        at(cylinder(0.04, 0.06, 2, 6), 'wood', 0, 1, 0),
        at(box(0.05, 0.05, 0.36), 'wood', 0, 1.95, 0.15),
        at(box(0.17, 0.22, 0.17), 'glass', 0, 1.75, 0.3),
        at(new THREE.ConeGeometry(0.15, 0.1, 4), 'iron', 0, 1.91, 0.3, 0, Math.PI / 4),
    ],
    bench: () => [
        at(box(0.95, 0.06, 0.32), 'wood', 0, 0.42, 0),
        at(box(0.95, 0.24, 0.05), 'wood', 0, 0.62, -0.15, -0.15),
        ...[-0.4, 0.4].map((x) => at(box(0.06, 0.42, 0.28), 'wood', x, 0.21, 0)),
    ],
    barrels: () => [
        at(cylinder(0.22, 0.2, 0.6, 12), 'wood', -0.15, 0.3, 0),
        at(cylinder(0.2, 0.18, 0.55, 12), 'wood', 0.22, 0.27, 0.12),
        at(cylinder(0.23, 0.23, 0.04, 12), 'iron', -0.15, 0.45, 0),
    ],
    crates: () => [
        at(box(0.45, 0.45, 0.45), 'wood', -0.15, 0.22, 0, 0, 0.2),
        at(box(0.4, 0.4, 0.4), 'wood', 0.2, 0.2, 0.15, 0, -0.15),
        at(box(0.36, 0.36, 0.36), 'wood', -0.1, 0.63, 0.02, 0, 0.5),
    ],
    anvil: () => [
        at(cylinder(0.22, 0.26, 0.5, 8), 'wood', 0, 0.25, 0),
        at(box(0.22, 0.14, 0.42), 'iron', 0, 0.57, 0),
        at(new THREE.ConeGeometry(0.08, 0.22, 4), 'iron', 0, 0.57, 0.3, Math.PI / 2),
        at(box(0.12, 0.08, 0.12), 'iron', 0, 0.68, -0.12),
    ],
    hay: () => [
        at(cylinder(0.36, 0.36, 0.8, 14), 'hay', 0, 0.36, 0, 0, 0, Math.PI / 2),
        at(cylinder(0.3, 0.3, 0.7, 12), 'hay', 0.05, 0.98, 0, 0, 0.4, Math.PI / 2),
    ],
    fence: () => [
        at(box(0.08, 0.8, 0.08), 'wood', -0.46, 0.4, 0), at(box(0.08, 0.8, 0.08), 'wood', 0.46, 0.4, 0),
        at(box(1, 0.07, 0.04), 'wood', 0, 0.62, 0), at(box(1, 0.07, 0.04), 'wood', 0, 0.32, 0),
    ],
    // Blé mûr et jeunes pousses en alternance, sur trois rangs.
    crops: () => [-0.3, 0, 0.3].flatMap((x, row) => [-0.3, 0, 0.3].map((z, index) =>
        at(new THREE.ConeGeometry(0.09, 0.45, 5), (row + index) % 2 ? 'leaf' : 'hay', x, 0.22, z))),
    cart: () => [
        at(box(0.7, 0.3, 0.95), 'wood', 0, 0.55, 0),
        ...[-0.4, 0.4].map((x) => at(cylinder(0.32, 0.32, 0.06, 12), 'wood', x, 0.32, -0.05, 0, 0, Math.PI / 2)),
        ...[-0.22, 0.22].map((x) => at(box(0.05, 0.05, 0.8), 'wood', x, 0.45, 0.8, 0.25)),
        at(box(0.6, 0.18, 0.7), 'hay', 0, 0.78, -0.05),
    ],
}

export interface VillageProps {
    /** Mobilier de ces cases, ajouté au groupe du chunk. */
    addTo(group: THREE.Group, props: readonly Prop[]): void
}

/** Couleurs unies, fondues dans un seul matériau à couleurs de sommets ; les autres gardent leurs textures. */
const PAINT: Partial<Record<Material, number>> = {cloth: 0xb2413c, clothLight: 0xeadcbc, hay: 0xd6b45a, iron: 0x34363b, leaf: 0x5f8f3a, fruit: 0xd2452f}

export function createVillageProps(materials: WorldMaterials): VillageProps {
    const palette: Partial<Record<Material | 'paint', THREE.Material>> = {
        wood: materials.wood, stone: materials.stone, plaster: materials.plaster, roof: materials.roof('#7a4a36'), glass: lanternGlass,
        water: new THREE.MeshStandardMaterial({color: 0x4f8fa0, roughness: 0.08, metalness: 0.1}),
        paint: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.8}),
    }
    // Pièces de chaque sorte, regroupées par matériau, construites à la première utilisation.
    const shapes = new Map<PropKind, [THREE.BufferGeometry, Material | 'paint'][]>()
    function shape(kind: PropKind) {
        if (!shapes.has(kind)) {
            shapes.set(kind, SHAPES[kind]().map(([geometry, material]) => {
                const flat = geometry.toNonIndexed()
                const color = PAINT[material]
                if (color === undefined) return [flat, material]
                const rgb = new THREE.Color(color)
                const colors = new Float32Array(flat.attributes.position.count * 3)
                for (let index = 0; index < colors.length; index += 3) colors.set([rgb.r, rgb.g, rgb.b], index)
                flat.setAttribute('color', new THREE.BufferAttribute(colors, 3))
                return [flat, 'paint']
            }))
        }
        return shapes.get(kind)!
    }

    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3(), unit = new THREE.Vector3(1, 1, 1)
    return {
        addTo(group, props) {
            // Tout le mobilier du chunk est fondu en un maillage par matériau (les cultures à part, sans ombre portée).
            const buckets = new Map<string, THREE.BufferGeometry[]>()
            for (const prop of props) {
                const [width, depth] = PROP_SIZE[prop.kind] ?? [1, 1]
                rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ANGLES[prop.facing ?? 'down'])
                matrix.compose(position.set(prop.x + width / 2, 0, prop.y + depth / 2), rotation, unit)
                for (const [geometry, material] of shape(prop.kind)) {
                    const key = `${material}:${prop.kind === 'crops' ? 'flat' : 'shadow'}`
                    buckets.set(key, [...buckets.get(key) ?? [], geometry.clone().applyMatrix4(matrix)])
                }
            }
            for (const [key, geometries] of buckets) {
                const [material, shadow] = key.split(':') as [Material | 'paint', string]
                const mesh = new THREE.Mesh(mergeGeometries(geometries)!, palette[material]!)
                geometries.forEach((geometry) => geometry.dispose())
                mesh.castShadow = shadow === 'shadow'
                mesh.receiveShadow = true
                // Géométrie propre au chunk : libérée avec lui (voir disposeChunk).
                mesh.userData.ownGeometry = true
                group.add(mesh)
            }
        },
    }
}
