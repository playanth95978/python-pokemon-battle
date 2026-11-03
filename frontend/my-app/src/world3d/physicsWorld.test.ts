import * as CANNON from 'cannon-es'
import { describe, expect, it } from 'vitest'
import type { Ground } from './physicsWorld'
import { createPhysics } from './physicsWorld'

function dropBox(physics: ReturnType<typeof createPhysics>, ground: Ground, x: number, y: number, z: number) {
    const body = new CANNON.Body({mass: 5, collisionFilterGroup: ground.group, collisionFilterMask: ground.mask})
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.1, 0.1, 0.1)))
    body.position.set(x, y, z)
    physics.world.addBody(body)
    return body
}

describe('Physique des corps tombés', () => {
    it('pose un corps lâché sur la pente du terrain, à la hauteur du sol sous lui', () => {
        // Pente douce vers l'est : 0,1 m de dénivelé par mètre.
        const physics = createPhysics((x) => x * 0.1)
        const body = dropBox(physics, physics.groundAt(12, 20), 12, 3, 20)
        for (let frame = 0; frame < 240; frame++) physics.step(1 / 60)
        expect(body.position.y).toBeGreaterThan(1.2 + 0.05)
        expect(body.position.y).toBeLessThan(1.2 + 0.25)
        expect(Math.abs(body.position.z - 20)).toBeLessThan(0.5)
    })

    it('ne fait toucher à chaque corps que son propre sol', () => {
        const physics = createPhysics(() => 0)
        const first = physics.groundAt(0, 0), second = physics.groundAt(3, 3)
        expect(first.group & second.mask).toBe(0)
        expect(second.group & first.mask).toBe(0)
        // Les parties d'un même corps ne se touchent pas entre elles.
        expect(first.group & first.mask).toBe(0)
    })

    it('ne laisse aucun corps dépasser 12 m/s, même éjecté', () => {
        const physics = createPhysics(() => 0)
        const body = dropBox(physics, physics.groundAt(0, 0), 0, 50, 0)
        body.velocity.set(0, 300, 0)
        physics.step(1 / 60)
        expect(body.velocity.length()).toBeLessThanOrEqual(12.0001)
    })
})
