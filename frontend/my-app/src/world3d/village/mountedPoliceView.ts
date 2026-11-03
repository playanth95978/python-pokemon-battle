/** Cavalerie stylisée en primitives partagées : aucun GLB, texture ou squelette supplémentaire. */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { officerPosition, type PoliceState } from './police'

interface Mount { root: THREE.Group; body: THREE.Object3D; legs: THREE.Object3D[]; knees: THREE.Object3D[]; tail: THREE.Object3D; phase: number }

function horseTemplate() {
    const root = new THREE.Group(), body = new THREE.Group()
    body.name = 'horse-body'
    root.add(body)
    const coat = new THREE.MeshStandardMaterial({color: 0x72513a, roughness: 0.9, flatShading: true})
    const dark = new THREE.MeshStandardMaterial({color: 0x30271f, roughness: 0.9})
    const navy = new THREE.MeshStandardMaterial({color: 0x263d66, roughness: 0.85})
    const steel = new THREE.MeshStandardMaterial({color: 0x939da8, metalness: 0.65, roughness: 0.4})
    const gold = new THREE.MeshStandardMaterial({color: 0xc2a052, metalness: 0.55, roughness: 0.5})
    const skin = new THREE.MeshStandardMaterial({color: 0xd4a47c, roughness: 0.9})
    const white = new THREE.MeshStandardMaterial({color: 0xddd7c4, roughness: 0.8})
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
    const sphere = (x: number, y: number, z: number) => new THREE.SphereGeometry(1, 10, 7).scale(x, y, z)
    const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z)
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
        geometry.rotateX(rx).rotateZ(rz).translate(x, y, z)
        const flat = geometry.toNonIndexed()
        geometry.dispose()
        if (!buckets.has(material)) buckets.set(material, [])
        buckets.get(material)!.push(flat)
    }
    // Corps, encolure, tête, oreilles, crinière et harnachement ; avant vers +z.
    add(sphere(0.32, 0.4, 0.83), coat, 0, 1.23, -0.1)
    add(sphere(0.34, 0.38, 0.38), coat, 0, 1.25, -0.64)
    add(sphere(0.23, 0.62, 0.24), coat, 0, 1.68, 0.51, 0.48)
    add(sphere(0.19, 0.25, 0.4), coat, 0, 2.12, 0.9, 0.25)
    add(sphere(0.16, 0.15, 0.2), dark, 0, 2.01, 1.16)
    for (const side of [-1, 1]) {
        add(new THREE.ConeGeometry(0.075, 0.27, 5), coat, side * 0.11, 2.4, 0.75, -0.25, side * -0.2)
        add(sphere(0.028, 0.04, 0.045), dark, side * 0.18, 2.18, 0.96)
    }
    add(box(0.07, 0.68, 0.18), dark, 0, 1.82, 0.27, 0.5)
    add(box(0.73, 0.12, 0.72), navy, 0, 1.59, -0.14)
    add(box(0.56, 0.13, 0.48), dark, 0, 1.69, -0.14)
    add(box(0.69, 0.055, 0.08), gold, 0, 1.62, -0.43)
    add(box(0.4, 0.05, 0.07), dark, 0, 2.13, 1.02, 0.2)
    // Cavalier assis, uniforme bleu, casque et écusson doré.
    add(box(0.39, 0.48, 0.24), navy, 0, 2.1, -0.19, -0.1)
    add(box(0.4, 0.06, 0.27), dark, 0, 1.9, -0.17)
    add(sphere(0.13, 0.17, 0.13), skin, 0, 2.5, -0.12)
    add(sphere(0.15, 0.12, 0.16), steel, 0, 2.62, -0.13)
    add(box(0.32, 0.035, 0.3), steel, 0, 2.56, -0.09)
    add(box(0.06, 0.16, 0.18), navy, 0, 2.75, -0.15)
    add(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 6).rotateX(Math.PI / 2), gold, 0, 2.15, -0.05)
    for (const side of [-1, 1]) {
        add(sphere(0.13, 0.09, 0.15), steel, side * 0.23, 2.3, -0.18)
        add(box(0.12, 0.28, 0.13), navy, side * 0.23, 2.12, -0.02, -0.75)
        add(box(0.1, 0.1, 0.3), navy, side * 0.23, 2.01, 0.15)
        add(sphere(0.065, 0.06, 0.065), white, side * 0.23, 2.01, 0.3)
        add(box(0.14, 0.38, 0.16), navy, side * 0.32, 1.66, -0.1, -0.2, side * -0.25)
        add(box(0.15, 0.28, 0.17), dark, side * 0.38, 1.37, -0.1)
        add(box(0.17, 0.1, 0.29), dark, side * 0.38, 1.23, 0)
    }
    for (const [material, pieces] of buckets) {
        const geometry = mergeGeometries(pieces)!
        pieces.forEach((piece) => piece.dispose())
        body.add(new THREE.Mesh(geometry, material))
    }
    const thigh = new THREE.CylinderGeometry(0.07, 0.045, 0.55, 7).translate(0, -0.275, 0)
    const shin = new THREE.CylinderGeometry(0.045, 0.035, 0.5, 7).translate(0, -0.25, 0)
    const hoof = box(0.12, 0.1, 0.18).translate(0, -0.51, 0.025)
    for (let index = 0; index < 4; index++) {
        const leg = new THREE.Group(), knee = new THREE.Group()
        leg.name = `leg-${index}`; knee.name = `knee-${index}`
        leg.position.set(index % 2 ? 0.24 : -0.24, 1.12, index < 2 ? 0.43 : -0.63)
        leg.add(new THREE.Mesh(thigh, coat))
        knee.position.y = -0.55
        knee.add(new THREE.Mesh(shin, coat), new THREE.Mesh(hoof, dark))
        leg.add(knee); root.add(leg)
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.8, 7).translate(0, -0.32, 0), dark)
    tail.name = 'tail'; tail.position.set(0, 1.4, -0.88); tail.rotation.x = 0.3
    root.add(tail)
    // Rênes : une seule petite ligne, partagée avec les autres montures.
    const reins = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.23, 2.01, 0.3), new THREE.Vector3(-0.15, 2.11, 1.02),
        new THREE.Vector3(0.23, 2.01, 0.3), new THREE.Vector3(0.15, 2.11, 1.02),
    ]), new THREE.LineBasicMaterial({color: 0x30271f}))
    body.add(reins)
    root.traverse((object) => {if (object instanceof THREE.Mesh) {object.castShadow = object.receiveShadow = true}})
    return root
}

export function createMountedPoliceView(scene: THREE.Scene, ground: (x: number, z: number) => number) {
    let template: THREE.Group | null = null
    const mounts = new Map<number, Mount>()
    function create(id: number): Mount {
        template ??= horseTemplate()
        const root = template.clone(true)
        root.name = `garde-monte-${id}`
        scene.add(root)
        const mount = {root, body: root.getObjectByName('horse-body')!, legs: [0, 1, 2, 3].map((n) => root.getObjectByName(`leg-${n}`)!),
            knees: [0, 1, 2, 3].map((n) => root.getObjectByName(`knee-${n}`)!), tail: root.getObjectByName('tail')!, phase: id * 1.7}
        mounts.set(id, mount)
        return mount
    }
    return {
        roots: () => [...mounts.values()].map((mount) => mount.root),
        update(state: PoliceState, seconds: number, visible: boolean) {
            const active = new Set(state.officers.map((officer) => officer.id))
            for (const [id, mount] of mounts) if (!active.has(id)) {mount.root.removeFromParent(); mounts.delete(id)}
            for (const officer of state.officers) {
                const mount = mounts.get(officer.id) ?? (visible ? create(officer.id) : undefined)
                if (!mount) continue
                mount.root.visible = visible
                if (!visible) continue
                const position = officerPosition(officer), x = position.x + 0.5, z = position.y + 0.5
                mount.root.position.set(x, ground(x, z), z)
                const turn = THREE.MathUtils.euclideanModulo(officer.heading - mount.root.rotation.y + Math.PI, Math.PI * 2) - Math.PI
                mount.root.rotation.y += turn * Math.min(1, seconds * 12)
                if (officer.moving) mount.phase += seconds * 12
                mount.body.position.y = officer.moving ? Math.sin(mount.phase * 2) * 0.035 : 0
                mount.legs.forEach((leg, index) => {
                    const gait = mount.phase + (index % 2 ? Math.PI : 0) + (index >= 2 ? 0.9 : 0)
                    leg.rotation.x = officer.moving ? Math.sin(gait) * 0.65 : 0
                    mount.knees[index].rotation.x = officer.moving ? Math.max(0, -Math.sin(gait)) * 0.8 : 0
                })
                mount.tail.rotation.z = Math.sin(mount.phase * 0.5) * 0.12
            }
        },
        dispose() {
            for (const mount of mounts.values()) mount.root.removeFromParent()
            mounts.clear()
            const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
            template?.traverse((object) => {
                if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return
                geometries.add(object.geometry)
                for (const material of [object.material].flat()) materials.add(material)
            })
            geometries.forEach((geometry) => geometry.dispose())
            materials.forEach((material) => material.dispose())
            template = null
        },
    }
}
