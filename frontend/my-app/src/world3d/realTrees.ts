/** Arbres réalistes générés par ez-tree : écorce texturée et feuillage en cartes, ramenés à l'échelle du jeu et instanciés. */
import { Tree, TreePreset } from '@dgreenheck/ez-tree'
import * as THREE from 'three'

export type TreeKind = 'oak' | 'aspen' | 'pine' | 'bush'
type Detail = 'near' | 'far'

interface Recipe {
    presets: (keyof typeof TreePreset)[]
    /** Hauteur visée en unités du monde (une case = 1). */
    height: number
    /** Teinte multipliée à la texture de feuilles (au-delà de 1 : éclaircit). */
    leafTint: [number, number, number]
}

const RECIPES: Record<TreeKind, Recipe> = {
    oak: {presets: ['Oak Medium', 'Ash Medium'], height: 4.2, leafTint: [1.35, 1.45, 1.2]},
    // La texture de tremble est automnale : on la ramène vers un vert tendre.
    aspen: {presets: ['Aspen Medium', 'Aspen Large'], height: 4.8, leafTint: [0.75, 1.15, 0.55]},
    pine: {presets: ['Pine Medium', 'Pine Small'], height: 4.6, leafTint: [1.2, 1.3, 1.15]},
    bush: {presets: ['Bush 1', 'Bush 2'], height: 1, leafTint: [1.25, 1.35, 1.1]},
}

/** Côtés des branches par niveau : le tronc reste rond, les rameaux deviennent triangulaires. */
const MAX_SEGMENTS: Record<Detail, number[]> = {near: [6, 3, 3, 3], far: [4, 3, 3, 3]}
/** Cartes de feuilles visées par arbre (deux triangles chacune). */
const LEAF_CARDS: Record<Detail, number> = {near: 500, far: 70}
/** Les arbres sont regroupés par cellules de 8 cases, chacune choisissant sa version selon la distance à la caméra. */
const CELL_SIZE = 8
/** Au-delà de cette distance caméra–cellule, la version allégée remplace l'arbre complet. */
const FAR_DISTANCE = 18

export interface TreeSet {
    variants: { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry }[]
    bark: THREE.MeshStandardMaterial
    leaves: THREE.MeshStandardMaterial
}

const time = {value: 0}

/** Avance le vent dans tous les feuillages. */
export function animateTrees(seconds: number) {
    time.value = seconds
}

/** Le haut de l'arbre oscille doucement, l'extrémité des cartes de feuilles frémit en plus. */
function windy(material: THREE.MeshStandardMaterial, leaves: boolean) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = time
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vec4 root = modelMatrix * instanceMatrix[3];
                float phase = uTime * 1.3 + root.x * 0.37 + root.z * 0.23;
                float sway = position.y * position.y * 0.006;
                transformed.x += sin(phase) * sway;
                transformed.z += cos(phase * 0.8) * sway * 0.6;
                ${leaves ? 'transformed += normal * sin(uTime * 4.0 + position.x * 3.0 + root.z) * 0.03 * uv.y;' : ''}`)
    }
    return material
}

/** Normales des feuilles orientées vers l'extérieur du houppier : il s'éclaire comme un volume, pas comme des cartes plates. */
function crownNormals(geometry: THREE.BufferGeometry) {
    geometry.computeBoundingBox()
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3())
    center.y -= (geometry.boundingBox!.max.y - geometry.boundingBox!.min.y) * 0.15
    const position = geometry.attributes.position, normal = geometry.attributes.normal, vector = new THREE.Vector3()
    for (let index = 0; index < position.count; index++) {
        vector.fromBufferAttribute(position, index).sub(center).normalize()
        normal.setXYZ(index, vector.x, vector.y + 0.25, vector.z)
    }
    geometry.normalizeNormals()
}

function generate(kind: TreeKind, preset: keyof typeof TreePreset, detail: Detail) {
    const tree = new Tree()
    tree.options.copy(structuredClone(TreePreset[preset]) as typeof tree.options)
    const {branch, leaves} = tree.options
    // Les presets visent un arbre seul en gros plan : moins de sections et des branches moins rondes suffisent en jeu.
    for (const level of [0, 1, 2, 3] as const) {
        const target = detail === 'near' ? Math.round(branch.sections[level] / (level === 0 ? 2 : 3)) : 1
        branch.sections[level] = Math.min(branch.sections[level], Math.max(level === 0 ? 4 : 1, target))
        branch.segments[level] = Math.min(branch.segments[level], MAX_SEGMENTS[detail][level])
    }
    // De loin, plus de brindilles : les feuilles poussent directement sur les rameaux.
    if (detail === 'far' && tree.options.type === 'deciduous') branch.levels = Math.min(branch.levels, 2)
    if (detail === 'far') leaves.billboard = 'single'
    // Nombre de cartes de feuilles ramené au budget ; les cartes grandissent d'autant pour garder un houppier aussi dense.
    tree.generate()
    const cards = tree.leavesMesh.geometry.index!.count / 6
    const density = Math.min(1, LEAF_CARDS[detail] / cards)
    leaves.count = Math.max(1, Math.round(leaves.count * density))
    leaves.size /= Math.sqrt(density)
    tree.generate()
    const bark = tree.branchesMesh.geometry, leafGeometry = tree.leavesMesh.geometry
    bark.computeBoundingBox()
    leafGeometry.computeBoundingBox()
    const scale = RECIPES[kind].height / Math.max(bark.boundingBox!.max.y, leafGeometry.boundingBox!.max.y)
    for (const geometry of [bark, leafGeometry]) {
        geometry.scale(scale, scale, scale)
        geometry.computeBoundingSphere()
    }
    crownNormals(leafGeometry)
    return tree
}

const materials = new Map<TreeKind, Pick<TreeSet, 'bark' | 'leaves'>>()
const sets = new Map<string, TreeSet>()

/** Variantes et matériaux partagés d'une essence, générés une seule fois par niveau de détail. */
export function treeSet(kind: TreeKind, detail: Detail = 'near'): TreeSet {
    const key = `${kind}:${detail}`
    let set = sets.get(key)
    if (set) return set
    const trees = RECIPES[kind].presets.map((preset) => generate(kind, preset, detail))
    let shared = materials.get(kind)
    if (!shared) {
        // ez-tree pose aussi une carte de rugosité sur son matériau Phong, qui ne s'en sert pas : on la récupère ici.
        const barkSource = trees[0].branchesMesh.material as THREE.MeshPhongMaterial & { roughnessMap: THREE.Texture | null }
        const leafSource = trees[0].leavesMesh.material as THREE.MeshPhongMaterial
        shared = {
            bark: windy(new THREE.MeshStandardMaterial({
                map: barkSource.map, normalMap: barkSource.normalMap, aoMap: barkSource.aoMap, roughnessMap: barkSource.roughnessMap,
                color: barkSource.color, roughness: 1, envMapIntensity: 0.5,
            }), false),
            leaves: windy(new THREE.MeshStandardMaterial({
                map: leafSource.map, color: new THREE.Color(...RECIPES[kind].leafTint), alphaTest: leafSource.alphaTest, side: THREE.DoubleSide,
                roughness: 0.85, envMapIntensity: 0.6,
            }), true),
        }
        materials.set(kind, shared)
    }
    set = {variants: trees.map((tree) => ({bark: tree.branchesMesh.geometry, leaves: tree.leavesMesh.geometry})), ...shared}
    sets.set(key, set)
    return set
}

/** Instances d'une cellule pour un niveau de détail : une paire écorce + feuillage par variante. */
function cellMeshes(set: TreeSet, byVariant: { matrices: Float32Array; colors: Float32Array }[], castShadow: boolean) {
    const group = new THREE.Group()
    byVariant.forEach(({matrices, colors}, variant) => {
        if (!matrices.length) return
        for (const [geometry, material, tinted] of [[set.variants[variant].bark, set.bark, false], [set.variants[variant].leaves, set.leaves, true]] as const) {
            const mesh = new THREE.InstancedMesh(geometry, material, matrices.length / 16)
            mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16)
            if (tinted) mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
            mesh.computeBoundingSphere()
            mesh.castShadow = castShadow
            mesh.receiveShadow = true
            mesh.matrixAutoUpdate = false
            group.add(mesh)
        }
    })
    return group
}

/** Attend qu'une texture chargée par ez-tree ait reçu son image (au plus 10 s, pour ne jamais bloquer le monde). */
function loaded(texture: THREE.Texture) {
    const start = performance.now()
    return new Promise<void>((resolve) => {
        const check = () => texture.image || performance.now() - start > 10000 ? resolve() : setTimeout(check, 16)
        check()
    })
}

/**
 * Génère toutes les variantes, attend leurs textures, les envoie au GPU et compile leurs shaders avec l'éclairage
 * de `scene` : aucun arbre n'apparaît blanc, sans écorce ni feuilles, ni ne fige l'image à sa première apparition.
 */
export async function prepareTrees(renderer: THREE.WebGLRenderer, scene: THREE.Scene, kinds: TreeKind[]) {
    const preview = new THREE.Scene()
    const one = {matrices: new Float32Array(new THREE.Matrix4().toArray()), colors: new Float32Array([1, 1, 1])}
    for (const kind of kinds) {
        for (const detail of ['near', 'far'] as const) {
            const set = treeSet(kind, detail)
            preview.add(cellMeshes(set, set.variants.map(() => one), true))
        }
    }
    const textures = new Set<THREE.Texture>()
    for (const {bark, leaves} of kinds.map((kind) => treeSet(kind))) {
        for (const texture of [bark.map, bark.normalMap, bark.aoMap, bark.roughnessMap, leaves.map]) if (texture) textures.add(texture)
    }
    await Promise.all([...textures].map(loaded))
    textures.forEach((texture) => renderer.initTexture(texture))
    await renderer.compileAsync(preview, new THREE.PerspectiveCamera(), scene)
}

/**
 * Instancie une essence : `matrices` (16 flottants par arbre, en coordonnées monde) et `colors` (teinte du feuillage, 3 par arbre).
 * Chaque arbre prend une variante selon sa position, toujours la même d'un chargement à l'autre ; chaque cellule
 * de 8 cases est un `THREE.LOD` qui bascule seul entre arbre complet et version allégée.
 */
export function treeInstances(kind: TreeKind, matrices: Float32Array, colors: Float32Array | null, castShadow: boolean) {
    const near = treeSet(kind, 'near'), far = treeSet(kind, 'far')
    const cells = new Map<string, number[]>()
    for (let index = 0; index < matrices.length / 16; index++) {
        const id = `${Math.floor(matrices[index * 16 + 12] / CELL_SIZE)},${Math.floor(matrices[index * 16 + 14] / CELL_SIZE)}`
        cells.set(id, [...cells.get(id) ?? [], index])
    }
    const group = new THREE.Group()
    for (const indices of cells.values()) {
        const center = new THREE.Vector3()
        for (const index of indices) center.add(new THREE.Vector3().fromArray(matrices, index * 16 + 12))
        center.divideScalar(indices.length)
        const byVariant = near.variants.map(() => ({matrices: [] as number[], colors: [] as number[]}))
        for (const index of indices) {
            const x = matrices[index * 16 + 12], z = matrices[index * 16 + 14]
            const pick = Math.abs(Math.floor(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453)) % near.variants.length
            // Matrices relatives au centre de la cellule : la distance du LOD se mesure depuis ce centre.
            const local = Array.from(matrices.subarray(index * 16, index * 16 + 16))
            local[12] -= center.x
            local[13] -= center.y
            local[14] -= center.z
            byVariant[pick].matrices.push(...local)
            byVariant[pick].colors.push(...(colors ? colors.subarray(index * 3, index * 3 + 3) : [1, 1, 1]))
        }
        const arrays = byVariant.map((variant) => ({matrices: new Float32Array(variant.matrices), colors: new Float32Array(variant.colors)}))
        const lod = new THREE.LOD()
        lod.position.copy(center)
        lod.addLevel(cellMeshes(near, arrays, castShadow), 0)
        // Les versions allégées projettent aussi leur ombre : elle est déjà là quand l'arbre complet prend le relais.
        // La marge de 10 % évite qu'une cellule clignote entre les deux versions à la limite.
        lod.addLevel(cellMeshes(far, arrays, castShadow), FAR_DISTANCE, 0.1)
        group.add(lod)
    }
    return group
}
