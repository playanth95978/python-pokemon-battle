import * as THREE from 'three'
import { expect, it, vi } from 'vitest'
import { createAttackVfx } from './attackVfx'
import type { AttackClip } from './attackPlayback'

const clip: AttackClip = {id: '1-0', actor: 'a', target: 'b', name: 'Éclair', kind: 'electric', outcome: 'hit'}
const start = new THREE.Vector3(-2, 1, 0), end = new THREE.Vector3(2, 1, 0)

it('charge puis projette six arcs électriques et révèle les ondes seulement à impact', () => {
  const scene = new THREE.Scene(), effects = createAttackVfx(scene)
  const group = scene.children[0]
  const bolt = group.children.find((child) => child instanceof THREE.LineSegments) as THREE.LineSegments
  const rings = group.children.filter((child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry)
  effects.update(0.1, start, end, clip)
  expect(bolt.visible).toBe(false)
  effects.update(0.6, start, end, clip)
  expect(bolt.visible).toBe(true)
  expect(bolt.geometry.getAttribute('position').count).toBe(216)
  expect(Array.from(bolt.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
  expect(rings.every((ring) => !ring.visible)).toBe(true)
  effects.update(0.7, start, end, clip)
  expect(rings.every((ring) => ring.visible)).toBe(true)
  effects.dispose()
  expect(scene.children).toHaveLength(0)
})

it.each(['miss', 'immune'] as const)('supprime les ondes d’impact pour un résultat %s', (outcome) => {
  const scene = new THREE.Scene(), effects = createAttackVfx(scene)
  effects.update(0.8, start, end, {...clip, outcome})
  const rings = scene.children[0].children.filter((child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry)
  expect(rings.every((ring) => !ring.visible)).toBe(true)
  effects.hide()
  expect(scene.children[0].visible).toBe(false)
  effects.dispose()
})

it('libère également les géométries et les matériaux des éclairs', () => {
  const scene = new THREE.Scene(), effects = createAttackVfx(scene)
  const bolt = scene.children[0].children.find((child) => child instanceof THREE.LineSegments) as THREE.LineSegments
  const geometry = vi.spyOn(bolt.geometry, 'dispose'), material = vi.spyOn(bolt.material as THREE.Material, 'dispose')
  effects.dispose()
  expect(geometry).toHaveBeenCalledOnce()
  expect(material).toHaveBeenCalledOnce()
})
