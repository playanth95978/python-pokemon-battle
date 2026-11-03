import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createPhysics } from '../physicsWorld'
import type { Limb } from './dismemberment'
import { createRagdoll } from './ragdoll'

/** Squelette aux noms et proportions du modèle des habitants (1,5 m), debout en (10, 0, 10). */
function skeleton() {
    const root = new THREE.Group()
    root.position.set(10, 0, 10)
    const bones = new Map<string, THREE.Bone>()
    const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0) => {
        const created = new THREE.Bone()
        created.name = name
        created.position.set(x, y, z)
        parent.add(created)
        bones.set(name, created)
        return created
    }
    const base = bone('Root', root, 0, 0)
    const body = bone('Body', base, 0, 0.92)
    const hips = bone('Hips', body, 0, 0)
    const torso = bone('Torso', bone('Abdomen', hips, 0, 0.1), 0, 0.1)
    const chest = bone('Chest', torso, 0, 0.12)
    bone('Head', bone('Neck', chest, 0, 0.2), 0, 0.08)
    for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
        const upper = bone(`UpperArm${side}`, bone(`Shoulder${side}`, chest, 0.06 * sign, 0.16), 0.1 * sign, 0)
        bone(`Wrist${side}`, bone(`LowerArm${side}`, upper, 0.27 * sign, 0), 0.24 * sign, 0)
        bone(`LowerLeg${side}`, bone(`UpperLeg${side}`, body, 0.1 * sign, -0.05), 0, -0.42)
        bone(`Foot${side}`, base, 0.1 * sign, 0.08)
        bone(`PT${side}`, base, 0.1 * sign, 0.3, 0.3)
    }
    root.updateMatrixWorld(true)
    return {root, bones}
}

function settle(limb: Limb | null, frame = 1 / 60, ground: (x: number, z: number) => number = () => 0) {
    const physics = createPhysics(ground)
    const {root, bones} = skeleton()
    const ragdoll = createRagdoll(root, physics, physics.groundAt(10, 10))!
    ragdoll.push(new THREE.Vector3(10, 1.2, 9.8), new THREE.Vector3(0, 20, 80))
    if (limb) ragdoll.sever(limb, new THREE.Vector3(0, 20, 80))
    for (let time = 0; time < 10; time += frame) {
        physics.step(frame)
        ragdoll.update()
    }
    const bodies = physics.world.bodies.filter((body) => body.mass > 0)
    return {bodies, bones}
}

describe('Ragdoll des habitants', () => {
    it('fait tomber le corps à terre près de l’endroit du coup, sans qu’il s’envole', () => {
        const {bodies, bones} = settle(null)
        for (const body of bodies) {
            expect(body.position.y).toBeLessThan(0.6)
            expect(body.position.y).toBeGreaterThan(-0.05)
            expect(Math.hypot(body.position.x - 10, body.position.z - 10)).toBeLessThan(3)
        }
        // Le coup renverse le corps, il ne le fait pas glisser : le bassin reste à moins d'un mètre et demi.
        expect(Math.hypot(bodies[0].position.x - 10, bodies[0].position.z - 10)).toBeLessThan(1.5)
        // Les os suivent leur solide : la tête est au sol, près du torse.
        const head = bones.get('Head')!.getWorldPosition(new THREE.Vector3())
        expect(head.y).toBeLessThan(0.6)
    })

    it.each<Limb>(['forearmR', 'armL', 'head', 'thighL', 'shinR', 'shinL'])('tranche %s sans que le corps ou le membre ne soient éjectés', (limb) => {
        const {bodies} = settle(limb)
        for (const body of bodies) {
            expect(body.position.y).toBeLessThan(0.8)
            expect(body.position.y).toBeGreaterThan(-0.05)
            expect(Math.hypot(body.position.x - 10, body.position.z - 10)).toBeLessThan(4)
        }
    })

    it.each<Limb>(['shinL', 'thighR', 'forearmL'])('reste stable quand les images sont lentes (50 ms), après avoir tranché %s', (limb) => {
        const {bodies} = settle(limb, 0.05)
        for (const body of bodies) {
            expect(body.position.y).toBeLessThan(0.8)
            expect(body.position.y).toBeGreaterThan(-0.05)
            expect(Math.hypot(body.position.x - 10, body.position.z - 10)).toBeLessThan(4)
        }
    })

    it.each<Limb>(['shinL', 'thighR', 'forearmL', 'head'])('reste au sol sur une berge en pente douce, après avoir tranché %s', (limb) => {
        // Pente de la place du bourg vers la rivière : environ 25 cm sur 8 m, avec un léger dévers.
        const {bodies} = settle(limb, 0.05, (x, z) => -0.03 * z - 0.01 * x)
        expect(Math.hypot(bodies[0].position.x - 10, bodies[0].position.z - 10)).toBeLessThan(1.5)
        for (const body of bodies) {
            expect(Math.hypot(body.position.x - 10, body.position.z - 10)).toBeLessThan(4)
            expect(body.position.y).toBeLessThan(0.5)
        }
    })
})
