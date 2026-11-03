import * as THREE from 'three'
import type { GuardDuel } from './guardDuel'

/** Un adversaire à pied, distinct des chevaux et des habitants. La même figurine sert au garde et au geôlier. */
export function createGuardDuelView() {
    const root = new THREE.Group()
    root.name = 'adversaire-duel-garde'
    const navy = new THREE.MeshStandardMaterial({color: 0x2c4770, roughness: 0.9})
    const steel = new THREE.MeshStandardMaterial({color: 0xa8b1bc, metalness: 0.65, roughness: 0.35})
    const leather = new THREE.MeshStandardMaterial({color: 0x322b28, roughness: 0.9})
    const skin = new THREE.MeshStandardMaterial({color: 0xd4ac87, roughness: 0.9})
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
        const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh)
        return mesh
    }
    add(new THREE.BoxGeometry(0.42, 0.6, 0.26), navy, 0, 0.95, 0)
    add(new THREE.SphereGeometry(0.17, 10, 7), skin, 0, 1.44, 0)
    add(new THREE.SphereGeometry(0.19, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 1.48, 0)
    add(new THREE.BoxGeometry(0.42, 0.05, 0.38), steel, 0, 1.48, 0.02)
    const legs = [-1, 1].map((side) => {
        const leg = new THREE.Group(); leg.position.set(side * 0.11, 0.65, 0); root.add(leg)
        add(new THREE.BoxGeometry(0.16, 0.45, 0.18), navy, 0, -0.22, 0, leg)
        add(new THREE.BoxGeometry(0.17, 0.17, 0.27), leather, 0, -0.55, 0.03, leg)
        return leg
    })
    add(new THREE.BoxGeometry(0.17, 0.45, 0.2), navy, 0.3, 0.98, 0.02)
    const arm = new THREE.Group(); arm.position.set(-0.28, 1.2, 0); root.add(arm)
    add(new THREE.BoxGeometry(0.16, 0.4, 0.17), navy, 0, -0.2, 0, arm)
    add(new THREE.SphereGeometry(0.08, 7, 5), skin, 0, -0.43, 0, arm)
    add(new THREE.BoxGeometry(0.05, 0.65, 0.025), steel, 0, -0.43, 0.34, arm).rotation.x = Math.PI / 2
    add(new THREE.BoxGeometry(0.23, 0.025, 0.05), steel, 0, -0.43, 0.08, arm)
    let phase = 0
    return {
        root,
        update(duel: GuardDuel | null, seconds: number, parent: THREE.Scene, ground: (x: number, y: number) => number) {
            if (!duel) {root.removeFromParent(); return}
            if (root.parent !== parent) parent.add(root)
            const {opponent} = duel
            root.position.set(opponent.x, ground(opponent.x, opponent.y), opponent.y)
            root.rotation.set(0, duel.heading, duel.result === 'won' ? Math.PI / 2 : 0)
            if (duel.result === 'won') root.position.y += 0.25
            phase += seconds * (duel.moving ? 10 : 0)
            legs.forEach((leg, index) => {leg.rotation.x = duel.moving ? Math.sin(phase + index * Math.PI) * 0.65 : 0})
            arm.rotation.x = duel.windup > 0 ? -1.8 + duel.windup : duel.stagger > 0 ? 0.5 : -0.5
        },
    }
}
