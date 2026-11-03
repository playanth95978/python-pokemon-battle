import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createMountedPoliceView } from './mountedPoliceView'
import { createPolice, type MountedOfficer } from './police'

describe('Cavaliers de la garde', () => {
    it('crée les montures seulement à la demande, partage leurs ressources et anime les jambes', () => {
        const scene = new THREE.Scene(), view = createMountedPoliceView(scene, () => 0.4), state = createPolice()
        view.update(state, 0.05, true)
        expect(view.roots()).toEqual([])
        const guard = (id: number, x: number): MountedOfficer => ({id, tile: {x, y: 10}, next: null, step: 0, path: [], heading: Math.PI / 2, repathIn: 0, moving: true})
        state.officers = [guard(0, 10), guard(1, 20)]
        view.update(state, 0.05, true)
        expect(view.roots()).toHaveLength(2)
        const [first, second] = view.roots()
        expect(first.position.toArray()).toEqual([10.5, 0.4, 10.5])
        const bodyA = first.getObjectByName('horse-body')!.children[0] as THREE.Mesh
        const bodyB = second.getObjectByName('horse-body')!.children[0] as THREE.Mesh
        expect(bodyA.geometry).toBe(bodyB.geometry)
        expect(bodyA.material).toBe(bodyB.material)
        expect(first.getObjectByName('leg-0')!.rotation.x).not.toBe(0)
        const disposed = vi.spyOn(bodyA.geometry, 'dispose')
        state.officers.shift()
        view.update(state, 0.05, true)
        expect(first.parent).toBeNull()
        expect(disposed).not.toHaveBeenCalled()
        view.update(state, 0, false)
        expect(second.visible).toBe(false)
        view.dispose()
        expect(second.parent).toBeNull()
        expect(disposed).toHaveBeenCalledOnce()
    })
})
