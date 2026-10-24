import * as THREE from 'three'
import type { AttackClip } from './attackPlayback'
import { ATTACK_DURATION } from './attackPlayback'
import { createAttackVfx } from './attackVfx'

/** Les illustrations bénéficient de la même chorégraphie que les modèles GLB. */
export function renderAttack3D(host: HTMLElement, clip: AttackClip, fromPlayer: boolean): () => void {
  const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'low-power'})
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75)); renderer.setClearColor(0, 0)
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 100)
  camera.position.z = 10
  const effects = createAttackVfx(scene)
  let width = 1, height = 1, frame = 0, stopped = false
  function resize() {
    width = host.clientWidth / 100; height = host.clientHeight / 100
    renderer.setSize(host.clientWidth, host.clientHeight)
    camera.right = width; camera.top = height; camera.updateProjectionMatrix()
  }
  resize()
  const observer = new ResizeObserver(resize); observer.observe(host)
  const start = performance.now()
  function draw(now: number) {
    if (stopped) return
    const progress = Math.min(1, (now - start) / ATTACK_DURATION)
    const source = new THREE.Vector3(width * (fromPlayer ? 0.19 : 0.81), height * (fromPlayer ? 0.24 : 0.74), 0)
    const target = new THREE.Vector3(width * (fromPlayer ? 0.81 : 0.19), height * (fromPlayer ? 0.74 : 0.24), 0)
    if (clip.outcome === 'miss') target.y += fromPlayer ? 0.8 : -0.8
    effects.update(progress, source, target, clip); renderer.render(scene, camera)
    if (progress < 1) frame = requestAnimationFrame(draw)
  }
  frame = requestAnimationFrame(draw)
  return () => {
    if (stopped) return
    stopped = true; cancelAnimationFrame(frame); observer.disconnect(); effects.dispose()
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
  }
}
