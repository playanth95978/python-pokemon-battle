import * as THREE from 'three'
import type { CrowdReaction } from './crowdReaction'

/** Gradins et figurants locaux : géométries partagées, aucune ressource externe. */
export function createSpectators(scene: THREE.Scene) {
  const stands = new THREE.Group(); stands.name = 'Spectateurs'; scene.add(stands)
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
  const box = new THREE.BoxGeometry(1, 1, 1), sphere = new THREE.SphereGeometry(1, 8, 6)
  geometries.push(box, sphere)
  const material = (color: number) => {
    const result = new THREE.MeshStandardMaterial({color, roughness: 0.95}); materials.push(result); return result
  }
  const shirts = [0xf2b75a, 0x8acdd1, 0xed7b83, 0xc5a5eb, 0x8fba80, 0xece8d2].map(material)
  const skins = [0xe6b88d, 0xa56c4e, 0xf0d0ac, 0x764d3c].map(material)
  const hair = material(0x303346), trousers = material(0x26364a), seats = material(0x365471)
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, position: number[], scale: number[]) {
    const result = new THREE.Mesh(geometry, mat)
    result.position.set(position[0], position[1], position[2]); result.scale.set(scale[0], scale[1], scale[2]); parent.add(result)
    return result
  }
  const people = Array.from({length: 28}, (_, index) => {
    const row = Math.floor(index / 14), column = index % 14
    const angle = Math.PI + (column + 0.5) * Math.PI / 14
    const radius = 5.5 + row * 0.7, level = 0.15 + row * 0.5
    const root = new THREE.Group(); root.name = `Spectateur-${index + 1}`
    root.position.set(Math.cos(angle) * radius, level, Math.sin(angle) * radius)
    root.lookAt(0, level, 0); stands.add(root)
    const body = new THREE.Group(); root.add(body)
    const skin = skins[index % skins.length], shirt = shirts[index % shirts.length]
    mesh(body, box, shirt, [0, 0.49, 0], [0.32, 0.4, 0.2])
    const head = new THREE.Group(); head.position.y = 0.84; body.add(head)
    mesh(head, sphere, skin, [0, 0, 0], [0.14, 0.17, 0.14])
    mesh(head, sphere, hair, [0, 0.09, -0.015], [0.145, 0.095, 0.145])
    for (const side of [-1, 1]) mesh(body, box, trousers, [side * 0.09, 0.14, 0], [0.105, 0.28, 0.13])
    const arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group(); shoulder.position.set(side * 0.2, 0.63, 0); body.add(shoulder)
      mesh(shoulder, box, shirt, [0, -0.11, 0], [0.09, 0.22, 0.1])
      const elbow = new THREE.Group(); elbow.position.y = -0.22; shoulder.add(elbow)
      mesh(elbow, box, skin, [0, -0.09, 0], [0.075, 0.18, 0.08])
      mesh(elbow, sphere, skin, [0, -0.2, 0], [0.055, 0.06, 0.055])
      return {shoulder, elbow, side}
    })
    return {root, body, head, arms, index}
  })
  for (let row = 0; row < 2; row++) {
    const geometry = new THREE.TorusGeometry(5.5 + row * 0.7, 0.24, 6, 48, Math.PI)
    geometries.push(geometry)
    const bench = new THREE.Mesh(geometry, seats); bench.rotation.x = -Math.PI / 2; bench.position.y = -0.04 + row * 0.5; stands.add(bench)
  }
  let reaction: CrowdReaction = 'watching', reactionStarted = 0, disposed = false
  return {
    update(time: number, next: CrowdReaction, motion: boolean, attention: number = 0) {
      if (disposed) return
      if (next !== reaction) {reaction = next; reactionStarted = time}
      // Une victoire garde sa pose, mais les sauts cessent après quelques secondes.
      const celebration = (reaction === 'victory' && time - reactionStarted < 4) || reaction === 'knockout'
      people.forEach(({body, head, arms, index}) => {
        const phase = index * 0.7, t = motion ? time : 0
        const cheering = reaction === 'cheer' || celebration
        body.position.y = motion && celebration ? Math.abs(Math.sin(t * 6 + phase)) * 0.15 : 0
        body.rotation.x = reaction === 'miss' ? 0.12 : 0
        head.rotation.y = motion ? attention * 0.12 + Math.sin(t * 0.65 + phase) * 0.06 : 0
        arms.forEach(({shoulder, elbow, side}) => {
          shoulder.rotation.set(0, 0, side * 0.12); elbow.rotation.set(0, 0, 0)
          if (celebration || reaction === 'victory') {
            shoulder.rotation.z = side * (2.5 + (motion && celebration ? Math.sin(t * 7 + phase) * 0.2 : 0))
            elbow.rotation.x = -0.2
          } else if (cheering) {
            shoulder.rotation.x = -0.9
            shoulder.rotation.z = -side * (0.5 + (motion ? Math.sin(t * 15 + phase) * 0.18 : 0))
            elbow.rotation.x = -0.8
          } else if (reaction === 'anticipation' || reaction === 'immune') {
            shoulder.rotation.x = -1.7; shoulder.rotation.z = -side * 0.22; elbow.rotation.x = -0.7
          }
        })
      })
    },
    dispose() {
      if (disposed) return
      disposed = true; scene.remove(stands); stands.clear()
      geometries.forEach((geometry) => geometry.dispose()); materials.forEach((mat) => mat.dispose())
    },
  }
}
