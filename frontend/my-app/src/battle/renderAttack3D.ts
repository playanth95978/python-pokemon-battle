import * as THREE from 'three'
import type { AttackClip } from './attackPlayback'
import { ATTACK_DURATION } from './attackPlayback'

/** Couche WebGL transparente, indépendante des données et des règles du combat. */
export function renderAttack3D(host: HTMLElement, clip: AttackClip, fromPlayer: boolean): () => void {
    const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'low-power'})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000)
    camera.position.z = 500
    scene.add(new THREE.AmbientLight(0xffffff, 2))
    const light = new THREE.DirectionalLight(0xffffff, 4)
    light.position.set(-100, 200, 300)
    scene.add(light)
    const group = new THREE.Group()
    scene.add(group)
    const colors: Record<AttackClip['kind'], number[]> = {
        fire: [0xff5c24, 0xffc447, 0xffe9b0], water: [0x38bdf8, 0xb4f4ff, 0x2563eb],
        vine: [0x4ade80, 0x166534, 0xbef264], charge: [0xfff4cb, 0xd6e4ff, 0xffffff],
        electric: [0xffe454, 0xfff9c4, 0xe0e7ff],
    }
    const geometry = clip.kind === 'fire' ? new THREE.IcosahedronGeometry(8, 0)
        : clip.kind === 'charge' ? new THREE.OctahedronGeometry(7) : new THREE.SphereGeometry(6, 10, 8)
    const materials = colors[clip.kind].map((color) => new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.1, transparent: true,
    }))
    const particles = Array.from({length: clip.kind === 'vine' ? 32 : 24}, (_, i) => {
        const mesh = new THREE.Mesh(geometry, materials[i % materials.length])
        group.add(mesh)
        return mesh
    })
    const ringGeometry = new THREE.TorusGeometry(24, 2, 8, 40)
    const ringMaterial = new THREE.MeshBasicMaterial({color: colors[clip.kind][0], transparent: true, opacity: 0})
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    scene.add(ring)
    let width = host.clientWidth
    let height = host.clientHeight

    function resize() {
        width = host.clientWidth;
        height = host.clientHeight
        renderer.setSize(width, height)
        camera.right = width;
        camera.top = height;
        camera.updateProjectionMatrix()
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    const start = performance.now()
    let frame = 0
    let stopped = false

    function draw(now: number) {
        if (stopped) return
        const progress = Math.min(1, (now - start) / ATTACK_DURATION)
        const source = new THREE.Vector3(width * (fromPlayer ? 0.19 : 0.81), height * (fromPlayer ? 0.24 : 0.74), 0)
        const target = new THREE.Vector3(width * (fromPlayer ? 0.81 : 0.19), height * (fromPlayer ? 0.74 : 0.24), 0)
        if (clip.outcome === 'miss') target.y += fromPlayer ? 80 : -80
        const travel = Math.min(1, progress / 0.72)
        particles.forEach((mesh, index) => {
            const angle = index * 2.39996 + progress * 8
            const spread = clip.kind === 'charge' ? 18 : clip.kind === 'fire' ? 23 : 12
            const t = Math.max(0, travel - index * (clip.kind === 'vine' ? 0.014 : 0.007))
            mesh.position.lerpVectors(source, target, t)
            mesh.position.x += Math.cos(angle) * spread * Math.sin(Math.PI * t)
            mesh.position.y += Math.sin(angle) * spread * Math.sin(Math.PI * t)
            mesh.position.z = Math.sin(angle) * spread
            mesh.rotation.set(progress * 8 + index, progress * 6, angle)
            const scale = clip.kind === 'water' ? 0.7 + (index % 4) * 0.22 : 0.7 + Math.sin(index + progress * 5) * 0.3
            mesh.scale.setScalar(scale)
            if (clip.kind === 'vine') mesh.scale.set(0.65, 1.9, 0.65)
            mesh.visible = progress < 0.9
        })
        materials.forEach((material) => {
            material.opacity = Math.min(1, progress * 8) * Math.max(0, (1 - progress) * 4)
        })
        ring.position.copy(target)
        ring.rotation.x = progress * 1.5
        ring.scale.setScalar(1 + Math.max(0, progress - 0.65) * 10)
        ringMaterial.opacity = clip.outcome === 'hit' ? Math.max(0, 1 - Math.abs(progress - 0.8) * 7) : 0
        renderer.render(scene, camera)
        if (progress < 1) frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => {
        stopped = true
        cancelAnimationFrame(frame)
        observer.disconnect()
        geometry.dispose();
        ringGeometry.dispose();
        ringMaterial.dispose()
        materials.forEach((material) => material.dispose())
        renderer.dispose()
        renderer.forceContextLoss()
        renderer.domElement.remove()
    }
}
