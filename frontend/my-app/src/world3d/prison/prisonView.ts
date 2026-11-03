import * as THREE from 'three'
import { CELL_DOOR, type PrisonState } from './prison'

export function createPrisonView(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x17202b)
    const stone = new THREE.MeshStandardMaterial({color: 0x555c65, roughness: 1})
    const floor = new THREE.MeshStandardMaterial({color: 0x73736c, roughness: 1})
    const iron = new THREE.MeshStandardMaterial({color: 0x313c49, metalness: 0.6, roughness: 0.5})
    const wood = new THREE.MeshStandardMaterial({color: 0x59432e, roughness: 0.9})
    const linen = new THREE.MeshStandardMaterial({color: 0x8c8970, roughness: 1})
    const brass = new THREE.MeshStandardMaterial({color: 0xf1c95a, metalness: 0.8, roughness: 0.3, emissive: 0x76520a, emissiveIntensity: 0.3})
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
        mesh.position.set(x, y, z); mesh.receiveShadow = true; scene.add(mesh)
        return mesh
    }
    box(15, 0.2, 16, 7.5, -0.1, 8, floor)
    for (const x of [1.5, 13.5]) box(1, 2.8, 14, x, 1.4, 8, stone)
    for (const z of [1.5, 14.5]) box(13, 2.8, 1, 7.5, 1.4, z, stone)
    // Pavage visible, sans texture distante.
    const seams = new THREE.GridHelper(16, 16, 0x434b53, 0x555d63)
    seams.position.set(7.5, 0.005, 8); scene.add(seams)
    const bars = new THREE.Group(), cellDoor = new THREE.Group()
    cellDoor.position.set(CELL_DOOR.x + 0.5, 0, CELL_DOOR.y)
    const barGeometry = new THREE.CylinderGeometry(0.045, 0.045, 2.6, 6)
    const bar = (parent: THREE.Group, x: number, z: number) => {
        const mesh = new THREE.Mesh(barGeometry, iron); mesh.position.set(x, 1.3, z); parent.add(mesh)
    }
    for (let z = 8; z < 14; z += 0.25) {
        if (z >= 10 && z < 11) continue
        bar(bars, 7.5, z)
    }
    for (let x = 2; x < 7.75; x += 0.25) bar(bars, x, 7.5)
    for (let z = 0; z < 1; z += 0.25) bar(cellDoor, 0, z)
    scene.add(bars, cellDoor)
    box(0.15, 0.12, 6.5, 7.5, 2.6, 10.75, iron)
    box(6, 0.12, 0.15, 4.75, 2.6, 7.5, iron)
    box(0.9, 0.35, 1.8, 2.6, 0.2, 12.8, wood)
    box(0.85, 0.15, 1.65, 2.6, 0.45, 12.8, linen)
    box(0.8, 0.12, 0.4, 2.6, 0.57, 12.25, linen)
    box(1.2, 2.35, 0.16, 12.5, 1.175, 2.04, wood)
    for (const y of [0.5, 1.7]) box(1.25, 0.12, 0.18, 12.5, y, 2.1, iron)
    box(0.12, 0.18, 0.12, 12.8, 1.1, 2.2, brass)
    scene.add(new THREE.HemisphereLight(0xc5d8ed, 0x4b3931, 2))
    const light = new THREE.PointLight(0xffcc8b, 38, 18, 2)
    light.position.set(9, 2.8, 9); scene.add(light)
    const second = new THREE.PointLight(0xadcfff, 20, 12, 2)
    second.position.set(4, 3, 4); scene.add(second)
    const keys = new THREE.Group()
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12), brass)
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.32, 0.045), brass)
    shaft.position.y = -0.22
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.045), brass)
    tooth.position.set(0.05, -0.32, 0)
    keys.add(ring, shaft, tooth); scene.add(keys); keys.visible = false
    return {
        scene,
        update(state: PrisonState, seconds: number) {
            cellDoor.rotation.y = state.cellOpen ? -Math.PI / 2 : 0
            keys.visible = state.keys !== null
            if (state.keys) {keys.position.set(state.keys.x + 0.5, 0.75 + Math.sin(seconds * 3) * 0.1, state.keys.y + 0.5); keys.rotation.y = seconds}
        },
        render: () => renderer.render(scene, camera),
    }
}
