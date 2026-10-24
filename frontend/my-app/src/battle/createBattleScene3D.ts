import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { pocModelPath } from './pocModels'
import { ATTACK_DURATION } from './attackPlayback'
import type { AttackClip } from './attackPlayback'
import type { Battle } from './types'

export interface BattleSceneController {
  update: (battle: Battle, active: AttackClip | null, motion: boolean) => void
  rotate: (angle: number) => void
  resetCamera: () => void
  dispose: () => void
}

const models = new Map<string, Promise<GLTF>>()
function loadModel(path: string): Promise<GLTF> {
  const previous = models.get(path)
  if (previous) return previous
  const pending = new GLTFLoader().loadAsync(path)
  models.set(path, pending)
  void pending.catch(() => models.delete(path))
  return pending
}

function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })
  scene.clear()
}

export async function createBattleScene3D(host: HTMLElement, firstName: string, secondName: string): Promise<BattleSceneController> {
  const firstPath = pocModelPath(firstName), secondPath = pocModelPath(secondName)
  if (!firstPath || !secondPath) throw new Error('Modèle 3D absent du POC')
  // Charger les fichiers avant d'allouer un contexte GPU évite une fuite sur erreur réseau.
  const assets = await Promise.all([loadModel(firstPath), loadModel(secondPath)])
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x13243b)
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x13243b, 13, 25)
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 40)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.8, 0)
  controls.enablePan = false
  controls.enableDamping = true
  controls.minDistance = 5
  controls.maxDistance = 15
  controls.maxPolarAngle = Math.PI * 0.47
  controls.minPolarAngle = 0.3
  scene.add(new THREE.HemisphereLight(0xd3ecff, 0x5c7c63, 2.4))
  const sunlight = new THREE.DirectionalLight(0xfff1d4, 3.2)
  sunlight.position.set(-3, 7, 5)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(1024, 1024)
  sunlight.shadow.camera.left = -6; sunlight.shadow.camera.right = 6
  sunlight.shadow.camera.top = 6; sunlight.shadow.camera.bottom = -6
  sunlight.shadow.normalBias = 0.03
  scene.add(sunlight)
  const rim = new THREE.DirectionalLight(0x8ac4ff, 2)
  rim.position.set(4, 4, -5); scene.add(rim)
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.2, 0.25, 64),
    new THREE.MeshStandardMaterial({ color: 0x467c75, roughness: 0.95 }))
  floor.position.y = -0.15; floor.receiveShadow = true; scene.add(floor)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.025, 8, 80), new THREE.MeshBasicMaterial({ color: 0xd3eae4 }))
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.015; scene.add(ring)
  const center = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.025, 8, 48), new THREE.MeshBasicMaterial({ color: 0xd3eae4 }))
  center.rotation.x = -Math.PI / 2; center.position.y = -0.015; scene.add(center)
  const line = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.01, 0.035), new THREE.MeshBasicMaterial({ color: 0xd3eae4 }))
  line.position.y = -0.02; scene.add(line)

  const actors = assets.map((asset, index) => {
    const model = asset.scene.clone(true)
    // Le cache conserve les données CPU ; chaque scène possède ses ressources GPU jetables.
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry = object.geometry.clone()
      object.material = Array.isArray(object.material) ? object.material.map((material) => material.clone()) : object.material.clone()
      object.castShadow = true; object.receiveShadow = true
    })
    const placement = new THREE.Group()
    placement.position.set(index === 0 ? -1.75 : 1.75, 0, 0)
    placement.rotation.y = index === 0 ? Math.PI / 2 : -Math.PI / 2
    placement.add(model); scene.add(placement)
    const mixer = new THREE.AnimationMixer(model)
    const actions = new Map(asset.animations.map((clip) => [clip.name, mixer.clipAction(clip)]))
    return { model, placement, mixer, actions, mode: '', impacted: false, fainted: false }
  })
  function pose(index: number, name: string, motion: boolean, restart = false) {
    const actor = actors[index]
    if (actor.mode === name && !restart) return
    actor.mixer.stopAllAction()
    const action = actor.actions.get(name)
    if (!action) return
    action.reset().setLoop(name === 'Idle' ? THREE.LoopRepeat : THREE.LoopOnce, name === 'Idle' ? Infinity : 1)
    action.clampWhenFinished = true
    action.play()
    if (!motion && name === 'Faint') action.time = action.getClip().duration
    actor.mixer.update(0)
    actor.mode = name
  }

  const effect = new THREE.Group(); scene.add(effect)
  const particleGeometry = new THREE.IcosahedronGeometry(0.075, 0)
  const particleMaterial = new THREE.MeshStandardMaterial({ color: 0xffd04f, emissive: 0xffa400, emissiveIntensity: 1.5 })
  const particles = Array.from({ length: 20 }, () => {
    const mesh = new THREE.Mesh(particleGeometry, particleMaterial); effect.add(mesh); return mesh
  })
  const boltGeometry = new THREE.BufferGeometry()
  boltGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(13 * 3), 3))
  const bolt = new THREE.Line(boltGeometry, new THREE.LineBasicMaterial({ color: 0xfff18b }))
  effect.add(bolt)
  effect.visible = false
  let state: { battle: Battle; active: AttackClip | null; motion: boolean } | null = null
  let lastClip: string | null = null
  let attackStarted = 0
  let disposed = false
  let frame = 0
  let previousTime = performance.now()

  function resetCamera() {
    const portrait = host.clientWidth / Math.max(1, host.clientHeight) < 1
    camera.position.set(portrait ? 5.8 : 4.2, portrait ? 4 : 3.1, portrait ? 8.8 : 6.6)
    controls.target.set(0, 0.8, 0); controls.update()
  }
  function resize() {
    renderer.setSize(host.clientWidth, host.clientHeight)
    camera.aspect = host.clientWidth / Math.max(1, host.clientHeight)
    camera.updateProjectionMatrix()
  }
  resize(); resetCamera()
  const observer = new ResizeObserver(resize); observer.observe(host)
  const onLost = (event: Event) => { event.preventDefault(); host.dispatchEvent(new Event('scene-unavailable')) }
  renderer.domElement.addEventListener('webglcontextlost', onLost)

  function update(battle: Battle, active: AttackClip | null, motion: boolean) {
    state = { battle, active, motion }
    if (active && motion && active.id !== lastClip) {
      lastClip = active.id; attackStarted = performance.now()
      actors.forEach((actor) => { actor.impacted = false; actor.fainted = false })
      const source = active.actor === battle.first.id ? 0 : 1
      pose(source, 'Attack', motion, true)
      pose(1 - source, 'Idle', motion)
      const color = active.kind === 'fire' ? 0xff812d : active.kind === 'water' ? 0x47cfff
        : active.kind === 'vine' ? 0x66dd88 : active.kind === 'electric' ? 0xffdf39 : 0xddeaff
      particleMaterial.color.setHex(color); particleMaterial.emissive.setHex(color)
    }
    if (!active || !motion) {
      effect.visible = false
      ;[battle.first, battle.second].forEach((fighter, index) => pose(index, fighter.hp === 0 ? 'Faint' : 'Idle', motion))
    }
  }

  function draw(now: number) {
    if (disposed) return
    const delta = Math.min(0.05, (now - previousTime) / 1000); previousTime = now
    const current = state
    if (current) {
      const { battle, active, motion } = current
      actors.forEach((actor) => actor.mixer.update(motion ? delta : 0))
      if (active && motion) {
        const progress = Math.min(1, (now - attackStarted) / ATTACK_DURATION)
        const source = active.actor === battle.first.id ? 0 : 1
        const target = 1 - source
        const targetFighter = target === 0 ? battle.first : battle.second
        effect.visible = progress < 0.88
        const start = actors[source].placement.position.clone().add(new THREE.Vector3(0, 1.25, 0.25))
        const end = actors[target].placement.position.clone().add(new THREE.Vector3(0, 1.1, active.outcome === 'miss' ? 1.3 : 0))
        bolt.visible = active.kind === 'electric' && progress > 0.15 && progress < 0.7
        if (bolt.visible) {
          const positions = boltGeometry.getAttribute('position')
          for (let index = 0; index < positions.count; index++) {
            const t = index / (positions.count - 1)
            const point = start.clone().lerp(end, t)
            point.y += index === 0 || index === positions.count - 1 ? 0 : Math.sin(index * 7 + progress * 40) * 0.22
            positions.setXYZ(index, point.x, point.y, point.z)
          }
          positions.needsUpdate = true
        }
        particles.forEach((particle, index) => {
          const t = Math.max(0, Math.min(1, progress / 0.7 - index * 0.012))
          particle.position.lerpVectors(start, end, t)
          const spread = Math.sin(t * Math.PI) * (active.kind === 'fire' ? 0.25 : 0.13)
          particle.position.y += Math.sin(index * 2.4 + progress * 10) * spread
          particle.position.z += Math.cos(index * 2.4 + progress * 10) * spread
          particle.rotation.set(progress * 10, index, progress * 8)
          const size = 0.65 + (index % 4) * 0.22
          particle.scale.set(size, active.kind === 'fire' ? size * 2 : size, size)
        })
        if (progress > 0.65 && active.outcome === 'hit' && !actors[target].impacted) {
          pose(target, 'Hit', motion, true); actors[target].impacted = true
        }
        if (progress > 0.86 && active.outcome === 'hit' && targetFighter.hp === 0 && !actors[target].fainted) {
          pose(target, 'Faint', motion, true); actors[target].fainted = true
        }
      }
    }
    controls.update(); renderer.render(scene, camera)
    frame = requestAnimationFrame(draw)
  }
  frame = requestAnimationFrame(draw)
  return {
    update, resetCamera,
    rotate(angle) { camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(controls.target); controls.update() },
    dispose() {
      if (disposed) return
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose()
      actors.forEach((actor) => { actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(actor.model) })
      renderer.domElement.removeEventListener('webglcontextlost', onLost)
      disposeScene(scene)
      sunlight.shadow.dispose()
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
    },
  }
}
