/** Les trois couches streamées du monde ouvert : terrain, végétation et herbe, sur un pool de workers commun. */
import * as THREE from 'three'
import { ChunkStreamer } from './chunkStreamer'
import type { TerrainData } from './terrainGeometry'
import { lodFor } from './terrainGeometry'
import { createTerrainMaterial } from './terrainMaterial'
import type { SpeciesInstances } from './vegetation'
import { grassBlade, speciesGeometry, windMaterial } from './vegetationModels'
import { WorkerPool } from './workerPool'

/** Terrain sur 10 chunks (320 cases) ; arbres détaillés sur 3, simplifiés jusqu'à 7 ; herbe sur 1. */
export const VIEW_RADIUS = 10
const TREE_RADIUS = 7, DETAILED_TREE_RADIUS = 3

function instances(geometry: THREE.BufferGeometry, material: THREE.Material, {matrices, colors}: Omit<SpeciesInstances, 'species'>, castShadow: boolean) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length / 16)
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
    // Sphère englobante des instances : le chunk entier est écarté s'il sort du champ de la caméra.
    mesh.computeBoundingSphere()
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    mesh.matrixAutoUpdate = false
    return mesh
}

export function createWorldLayers(scene: THREE.Scene, renderer: THREE.WebGLRenderer, seed: number) {
    const pool = new WorkerPool(seed)
    const time = {value: 0}
    const terrainMaterial = createTerrainMaterial(renderer)
    const plantMaterial = windMaterial(time, 0.012)
    const grassMaterial = windMaterial(time, 0.9)
    grassMaterial.side = THREE.DoubleSide
    // Brins lisses et mats : sans reflets, ils ne blanchissent pas au soleil.
    Object.assign(grassMaterial, {flatShading: false, envMapIntensity: 0.1, roughness: 1})

    const terrain = new ChunkStreamer<TerrainData>(scene, pool, {
        kind: 'terrain', radius: VIEW_RADIUS, levelFor: lodFor,
        build(data, level) {
            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
            geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3))
            geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
            geometry.setAttribute('surface', new THREE.BufferAttribute(data.surfaces, 3))
            geometry.setIndex(new THREE.BufferAttribute(data.indices, 1))
            geometry.computeBoundingSphere()
            const mesh = new THREE.Mesh(geometry, terrainMaterial)
            mesh.receiveShadow = true
            mesh.castShadow = level <= 1
            return mesh
        },
        dispose: (object) => (object as THREE.Mesh).geometry.dispose(),
    })

    const vegetation = new ChunkStreamer<SpeciesInstances[]>(scene, pool, {
        kind: 'vegetation', radius: TREE_RADIUS, levelFor: (distance) => distance <= DETAILED_TREE_RADIUS ? 0 : 1,
        build(data, level) {
            if (!data.length) return null
            const group = new THREE.Group()
            // Une instance par espèce et par chunk : un appel de dessin pour toute une forêt d'un même arbre.
            for (const species of data) group.add(instances(speciesGeometry(species.species, level === 1), plantMaterial, species, level === 0))
            return group
        },
        dispose: (object) => object.traverse((child) => { if (child instanceof THREE.InstancedMesh) child.dispose() }),
    })

    const grass = new ChunkStreamer<Omit<SpeciesInstances, 'species'>>(scene, pool, {
        kind: 'grass', radius: 1, levelFor: () => 0,
        build: (data) => data.matrices.length ? instances(grassBlade, grassMaterial, data, false) : null,
        dispose: (object) => (object as THREE.InstancedMesh).dispose(),
    })

    return {
        /** Le terrain passe en premier : il est servi avant la végétation quand les workers sont occupés. */
        update(player: { x: number; y: number }, seconds: number) {
            time.value = seconds
            terrain.update(player)
            vegetation.update(player)
            grass.update(player)
        },
        stats() {
            const ground = terrain.stats(), plants = vegetation.stats(), blades = grass.stats()
            return {terrain: ground.loaded, vegetation: plants.loaded, pending: ground.pending + plants.pending + blades.pending, workers: pool.size}
        },
    }
}
