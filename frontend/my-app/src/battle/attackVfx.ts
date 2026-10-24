import * as THREE from 'three'
import type { AttackClip } from './attackPlayback'

const palettes = {
  electric: [0xffdf35, 0xffffd2, 0x8cdcff], fire: [0xff6021, 0xffc13d, 0xffefb3],
  water: [0x35b5ff, 0xa4efff, 0x4285ef], vine: [0x4bdd76, 0xc5f767, 0x238a52],
  charge: [0xd9eaff, 0xffffff, 0x9ab2d9],
}

/** Même chorégraphie en coordonnées monde pour les arènes 2D et 3D. */
export function createAttackVfx(scene: THREE.Scene) {
  const group = new THREE.Group(); scene.add(group)
  const materials = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}))
  const geometry = new THREE.IcosahedronGeometry(0.075, 1)
  const particles = Array.from({length: 64}, (_, index) => {
    const mesh = new THREE.Mesh(geometry, materials[index % 3]); group.add(mesh); return mesh
  })
  const glowMaterial = new THREE.MeshBasicMaterial({transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending})
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), glowMaterial); group.add(glow)
  const rings = Array.from({length: 3}, () => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 6, 40), glowMaterial.clone()); group.add(ring); return ring
  })
  const boltGeometry = new THREE.BufferGeometry()
  boltGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 18 * 2 * 3), 3))
  const boltMaterial = new THREE.LineBasicMaterial({color: 0xfff6aa, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending})
  const bolts = new THREE.LineSegments(boltGeometry, boltMaterial); bolts.frustumCulled = false; group.add(bolts)
  const light = new THREE.PointLight(0xffdf35, 0, 5); group.add(light)
  const direction = new THREE.Vector3(), point = new THREE.Vector3(), head = new THREE.Vector3()
  const normal = new THREE.Vector3(0, 0, 1)
  group.visible = false

  function update(progress: number, start: THREE.Vector3, end: THREE.Vector3, clip: AttackClip) {
    group.visible = progress > 0 && progress < 1
    const palette = palettes[clip.kind]
    const travel = THREE.MathUtils.clamp((progress - 0.22) / 0.43, 0, 1)
    const aftermath = THREE.MathUtils.clamp((progress - 0.65) / 0.35, 0, 1)
    const charging = progress < 0.22
    const hit = clip.outcome === 'hit' && progress >= 0.65
    direction.subVectors(end, start).normalize()
    head.copy(start).lerp(end, travel)
    materials.forEach((material, index) => {
      material.color.setHex(palette[index]); material.opacity = Math.min(1, progress * 8) * (1 - aftermath)
    })
    glowMaterial.color.setHex(palette[0]); glowMaterial.opacity = charging ? progress * 1.5 : 0.12 * (1 - aftermath)
    glow.position.copy(charging ? start : head)
    glow.scale.setScalar(charging ? 0.6 + progress * 7 : 0.7 + Math.sin(progress * 18) * 0.08)
    light.color.setHex(palette[0]); light.position.copy(glow.position)
    light.intensity = (charging ? progress * 5 : 1 - aftermath) * 1.8
    particles.forEach((particle, index) => {
      const angle = index * 2.39996 + progress * 9
      if (charging) {
        const radius = (1 - progress / 0.22) * 0.5 + 0.15
        particle.position.copy(start).add(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.sin(index * 3) * radius))
      } else {
        const t = THREE.MathUtils.clamp(travel - index * 0.006, 0, 1)
        particle.position.lerpVectors(start, end, t)
        const spread = (clip.kind === 'fire' ? 0.25 : 0.12) * Math.sin(t * Math.PI)
        particle.position.y += Math.sin(angle) * spread + (clip.kind === 'fire' ? aftermath * (index % 7) * 0.07 : 0)
        particle.position.z += Math.cos(angle) * spread
        if (hit) {
          const radius = aftermath * (0.3 + (index % 7) * 0.12)
          particle.position.copy(end).add(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.sin(index * 2) * radius))
        }
      }
      particle.visible = clip.kind !== 'electric' || charging || hit || index % 4 === 0
      const size = (0.4 + (index % 4) * 0.18) * (1 - aftermath * 0.7)
      particle.scale.set(size, clip.kind === 'fire' ? size * 2.8 : clip.kind === 'vine' ? size * 2 : size, size)
      particle.rotation.set(angle, progress * 8, angle * 0.4)
    })
    bolts.visible = clip.kind === 'electric' && !charging && progress < 0.76
    boltMaterial.opacity = 0.8 * (1 - aftermath)
    if (bolts.visible) {
      const positions = boltGeometry.getAttribute('position')
      const tick = Math.floor(progress * 22)
      for (let branch = 0; branch < 6; branch++) {
        for (let segment = 0; segment < 18; segment++) {
          for (let endpoint = 0; endpoint < 2; endpoint++) {
            const t = (segment + endpoint) / 18
            point.copy(start).lerp(head, t)
            const spread = Math.sin(t * Math.PI) * (0.12 + branch * 0.045)
            point.y += Math.sin((segment + endpoint) * 9 + tick * 3 + branch) * spread
            point.z += Math.cos((segment + endpoint) * 7 + tick + branch * 3) * spread
            positions.setXYZ((branch * 18 + segment) * 2 + endpoint, point.x, point.y, point.z)
          }
        }
      }
      positions.needsUpdate = true
    }
    rings.forEach((ring, index) => {
      ring.visible = hit
      ring.position.copy(end); ring.quaternion.setFromUnitVectors(normal, direction)
      ring.material.color.setHex(palette[index]); ring.material.opacity = (1 - aftermath) * 0.6
      ring.scale.setScalar(0.5 + aftermath * (4 + index * 1.5))
    })
  }
  return {
    update,
    hide() { group.visible = false },
    dispose() {
      scene.remove(group)
      geometry.dispose(); glow.geometry.dispose(); boltGeometry.dispose(); boltMaterial.dispose(); glowMaterial.dispose()
      materials.forEach((material) => material.dispose())
      rings.forEach((ring) => {ring.geometry.dispose(); ring.material.dispose()})
      group.clear()
    },
  }
}
