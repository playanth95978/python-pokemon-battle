/** Une instance par maison et par pièce du GLB, regroupée par géométrie/matériau dans chaque chunk. */
import * as THREE from 'three'
import type { Building, HouseModel } from '../world/types'
import { HOUSE_ANGLES } from '../world/buildings'

/** Échelle commune du pack Quaternius : portes d'environ 1,7 m pour des personnages de 1,5 m. */
export const HOUSE_SCALE = 2.33

export function buildHouseInstances(
    buildings: readonly Building[], templates: ReadonlyMap<HouseModel, THREE.Object3D>,
    materialFor: (material: THREE.Material, building: Building) => THREE.Material,
) {
    const group = new THREE.Group()
    const buckets = new Map<string, {geometry: THREE.BufferGeometry; materials: THREE.Material | THREE.Material[]; matrices: THREE.Matrix4[]}>()
    const transform = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3()
    const scale = new THREE.Vector3().setScalar(HOUSE_SCALE)
    for (const building of buildings) {
        rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, HOUSE_ANGLES[building.facing ?? 'down'])
        transform.compose(position.set(building.x + building.width / 2, 0, building.y + building.height / 2), rotation, scale)
        templates.get(building.model)!.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return
            const materials = Array.isArray(object.material) ? object.material.map((material) => materialFor(material, building))
                : materialFor(object.material, building)
            const key = `${object.geometry.uuid}:${[materials].flat().map((material) => material.uuid).join(',')}`
            if (!buckets.has(key)) buckets.set(key, {geometry: object.geometry, materials, matrices: []})
            buckets.get(key)!.matrices.push(new THREE.Matrix4().multiplyMatrices(transform, object.matrixWorld))
        })
    }
    for (const {geometry, materials, matrices} of buckets.values()) {
        const mesh = new THREE.InstancedMesh(geometry, materials, matrices.length)
        matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
        mesh.instanceMatrix.needsUpdate = true
        mesh.castShadow = mesh.receiveShadow = true
        mesh.computeBoundingBox()
        mesh.computeBoundingSphere()
        group.add(mesh)
    }
    return group
}
