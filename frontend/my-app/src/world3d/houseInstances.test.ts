import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createHouse } from '../world/buildings'
import { buildHouseInstances, HOUSE_SCALE } from './houseInstances'
import type { HouseModel } from '../world/types'

describe('Maisons instanciées par chunk', () => {
    it('regroupe les maisons identiques sans perdre leur position, leur rotation et le pivot du GLB', () => {
        const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial()
        const template = new THREE.Group(), part = new THREE.Mesh(geometry, material)
        part.position.y = 1
        template.add(part); template.updateMatrixWorld(true)
        const houses = [createHouse(10, 20, 'fantasy_house_a', 'A', '#abc'), createHouse(30, 40, 'fantasy_house_a', 'B', '#abc', 'left')]
        const group = buildHouseInstances(houses, new Map<HouseModel, THREE.Object3D>([['fantasy_house_a', template]]), (m) => m)
        expect(group.children).toHaveLength(1)
        const mesh = group.children[0] as THREE.InstancedMesh
        expect(mesh.count).toBe(2)
        expect(mesh.geometry).toBe(geometry)
        const matrix = new THREE.Matrix4()
        mesh.getMatrixAt(0, matrix)
        expect(new THREE.Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([12.5, expect.closeTo(HOUSE_SCALE), 23])
        mesh.getMatrixAt(1, matrix)
        const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3()
        matrix.decompose(position, rotation, scale)
        expect(position.toArray()).toEqual([33, expect.closeTo(HOUSE_SCALE), 42.5])
        expect(new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).x).toBeCloseTo(-1)
        expect(mesh.boundingSphere!.radius).toBeGreaterThan(10)
        const disposeGeometry = vi.spyOn(geometry, 'dispose'), disposeMaterial = vi.spyOn(material, 'dispose')
        mesh.dispose()
        expect(disposeGeometry).not.toHaveBeenCalled()
        expect(disposeMaterial).not.toHaveBeenCalled()
    })

    it('sépare les groupes dont les matériaux diffèrent et ne modifie pas le modèle partagé', () => {
        const template = new THREE.Group(), geometry = new THREE.BoxGeometry()
        const original = new THREE.MeshStandardMaterial(), blue = new THREE.MeshStandardMaterial(), red = new THREE.MeshStandardMaterial()
        template.add(new THREE.Mesh(geometry, original)); template.updateMatrixWorld(true)
        const houses = [createHouse(10, 20, 'fantasy_house_a', 'A', 'blue'), createHouse(30, 40, 'fantasy_house_a', 'B', 'red')]
        const group = buildHouseInstances(houses, new Map<HouseModel, THREE.Object3D>([['fantasy_house_a', template]]), (_, b) => b.roof === 'blue' ? blue : red)
        expect(group.children).toHaveLength(2)
        expect((template.children[0] as THREE.Mesh).material).toBe(original)
        expect((group.children[0] as THREE.Mesh).geometry).toBe((group.children[1] as THREE.Mesh).geometry)
    })
})
