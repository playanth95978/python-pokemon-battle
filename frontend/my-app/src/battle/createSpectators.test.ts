import * as THREE from 'three'
import { expect, it, vi } from 'vitest'
import { createSpectators } from './createSpectators'

it('ajoute 28 spectateurs, change leur pose et libère toutes leurs ressources', () => {
  const scene = new THREE.Scene(), spectators = createSpectators(scene)
  const stands = scene.getObjectByName('Spectateurs')!
  expect(stands.children.filter((child) => child.name.startsWith('Spectateur-'))).toHaveLength(28)
  const person = scene.getObjectByName('Spectateur-1')!, body = person.children[0]
  const left = body.children[4]
  spectators.update(1, 'watching', true)
  const resting = left.rotation.z
  spectators.update(1.2, 'cheer', true)
  expect(left.rotation.z).not.toBe(resting)
  spectators.update(1.4, 'knockout', true)
  expect(body.position.y).toBeGreaterThan(0)
  const mesh = body.children[0] as THREE.Mesh
  const geometry = vi.spyOn(mesh.geometry, 'dispose'), material = vi.spyOn(mesh.material as THREE.Material, 'dispose')
  spectators.dispose(); spectators.dispose()
  expect(scene.children).toHaveLength(0)
  expect(geometry).toHaveBeenCalledOnce()
  expect(material).toHaveBeenCalledOnce()
})

it('conserve une pose fixe avec mouvements réduits et termine la célébration animée', () => {
  const scene = new THREE.Scene(), spectators = createSpectators(scene)
  const body = scene.getObjectByName('Spectateur-1')!.children[0]
  spectators.update(1, 'victory', false)
  const pose = body.children.map((child) => child.rotation.toArray())
  spectators.update(20, 'victory', false)
  expect(body.position.y).toBe(0)
  expect(body.children.map((child) => child.rotation.toArray())).toEqual(pose)
  spectators.update(25, 'victory', true)
  expect(body.position.y).toBe(0)
  spectators.dispose()
})
