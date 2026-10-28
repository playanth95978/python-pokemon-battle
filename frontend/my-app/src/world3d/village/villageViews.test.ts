import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createVillagePokemon, VILLAGE_POKEMON } from './villagePokemon'
import { createVillagePokemonView } from './villagePokemonView'
import { createVillagerView } from './villagerView'
import { createVillagers, VILLAGERS } from './villagers'

const {loadModel} = vi.hoisted(() => ({loadModel: vi.fn()}))
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({GLTFLoader: class { loadAsync = loadModel }}))

describe('Chargement progressif des habitants', () => {
    it('partage un seul GLB et crée au plus deux habitants par image, puis les libère à distance', async () => {
        const template = new THREE.Group()
        const sourceMaterial = new THREE.MeshStandardMaterial({name: 'White'})
        const geometry = new THREE.BoxGeometry(1, 2, 1)
        const disposeGeometry = vi.spyOn(geometry, 'dispose')
        const disposeOriginal = vi.spyOn(sourceMaterial, 'dispose')
        template.add(new THREE.Mesh(geometry, sourceMaterial))
        loadModel.mockResolvedValueOnce({scene: template, animations: []})
        const scene = new THREE.Scene()
        const villagers = createVillagers(VILLAGERS, 10)
        const view = createVillagerView(scene, villagers, () => 0)
        await Promise.resolve()
        const around = new THREE.Vector3(18, 0, 36)
        const frustum = new THREE.Frustum()
        expect(view.roots()).toHaveLength(0)
        view.update(0.1, around, true, frustum)
        expect(view.roots()).toHaveLength(2)
        view.update(0.1, around, true, frustum)
        expect(view.roots()).toHaveLength(4)
        expect(loadModel).toHaveBeenCalledTimes(1)
        const owned = (view.roots()[0].children[0].children[0] as THREE.Mesh).material as THREE.Material
        const disposeOwned = vi.spyOn(owned, 'dispose')
        view.update(0.1, new THREE.Vector3(1000, 0, 1000), true, frustum)
        expect(view.roots()).toHaveLength(0)
        expect(disposeOwned).toHaveBeenCalledOnce()
        expect(disposeOriginal).not.toHaveBeenCalled()
        expect(disposeGeometry).not.toHaveBeenCalled()
    })

    it('ne construit les figurines Pokémon qu’à proximité, avec un budget de deux par image', () => {
        const list = createVillagePokemon(VILLAGE_POKEMON, () => 0.5)
        const view = createVillagePokemonView(new THREE.Scene(), list, () => 0, () => 0)
        expect(view.roots()).toHaveLength(0)
        view.update(0, 0.1, new THREE.Vector3(1000, 0, 1000), true)
        expect(view.roots()).toHaveLength(0)
        view.update(0, 0.1, new THREE.Vector3(18, 0, 36), true)
        expect(view.roots()).toHaveLength(2)
        view.update(1, 0.1, new THREE.Vector3(18, 0, 36), true)
        expect(view.roots()).toHaveLength(4)
        view.update(2, 0.1, new THREE.Vector3(1000, 0, 1000), true)
        expect(view.roots()).toHaveLength(0)
    })
})
