/**
 * Sang : jets qui giclent d'un moignon pendant quelques secondes, en faiblissant, et flaques qui s'étalent au sol puis
 * sèchent. Des réserves fixes de particules et de flaques : rien n'est alloué pendant le jeu.
 */
import * as THREE from 'three'

const DROPS = 160, POOLS = 12
/** Durée d'un jet, et vie d'une flaque avant qu'elle ne disparaisse. */
const SPURT_SECONDS = 2.5, POOL_SECONDS = 90

interface Drop { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }
interface Spurt { from: THREE.Object3D; age: number; carry: number }
interface Pool { mesh: THREE.Mesh; age: number; size: number }

export function createGoreView(scene: THREE.Scene, ground: (x: number, z: number) => number) {
    const dropGeometry = new THREE.SphereGeometry(0.018, 6, 4)
    const blood = new THREE.MeshStandardMaterial({color: 0x8c0a0a, roughness: 0.3})
    const drops: Drop[] = Array.from({length: DROPS}, () => {
        const mesh = new THREE.Mesh(dropGeometry, blood)
        mesh.visible = false
        scene.add(mesh)
        return {mesh, velocity: new THREE.Vector3(), life: 0}
    })
    let nextDrop = 0
    const poolGeometry = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2)
    const pools: Pool[] = Array.from({length: POOLS}, () => {
        const mesh = new THREE.Mesh(poolGeometry, new THREE.MeshStandardMaterial({
            color: 0x5a0606, roughness: 0.15, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
        }))
        mesh.visible = false
        mesh.renderOrder = 1
        scene.add(mesh)
        return {mesh, age: 0, size: 0}
    })
    let nextPool = 0
    const spurts: Spurt[] = []
    const origin = new THREE.Vector3(), direction = new THREE.Vector3()

    function emit(at: THREE.Vector3, toward: THREE.Vector3, speed: number, spread: number) {
        const drop = drops[nextDrop++ % DROPS]
        drop.mesh.position.copy(at)
        drop.velocity.copy(toward).multiplyScalar(speed)
            .add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread))
        drop.life = 1.2
        drop.mesh.visible = true
    }

    return {
        /** Le moignon `from` gicle en pulsations, comme un cœur qui bat encore. */
        spurt(from: THREE.Object3D) {
            spurts.push({from, age: 0, carry: 0})
        },
        /** Éclaboussure à l'impact d'un coup. */
        splash(at: THREE.Vector3, toward: THREE.Vector3, amount: number) {
            for (let count = 0; count < amount; count++) emit(at, toward, 1.5, 1.6)
        },
        /** Flaque sous un corps ; elle s'étend jusqu'à `size` mètres de rayon. */
        pool(x: number, z: number, size: number) {
            const pool = pools[nextPool++ % POOLS]
            pool.mesh.position.set(x, ground(x, z) + 0.015, z)
            pool.mesh.rotation.y = Math.random() * Math.PI
            Object.assign(pool, {age: 0, size})
            pool.mesh.visible = true
        },
        update(seconds: number, time: number) {
            for (let index = spurts.length - 1; index >= 0; index--) {
                const spurt = spurts[index]
                spurt.age += seconds
                if (spurt.age > SPURT_SECONDS || !spurt.from.parent) {
                    spurts.splice(index, 1)
                    continue
                }
                // Pulsations d'environ 1,3 par seconde, de plus en plus faibles.
                const beat = Math.max(0, Math.sin(time * 8.5)) * (1 - spurt.age / SPURT_SECONDS)
                spurt.carry += seconds * 60 * beat
                spurt.from.getWorldPosition(origin)
                direction.set(0, 0, 1).applyQuaternion(spurt.from.getWorldQuaternion(new THREE.Quaternion()))
                while (spurt.carry >= 1) {
                    spurt.carry--
                    emit(origin, direction, 1.2 + beat * 2, 0.5)
                }
            }
            for (const drop of drops) {
                if (!drop.mesh.visible) continue
                drop.life -= seconds
                drop.velocity.y -= 9.8 * seconds
                drop.mesh.position.addScaledVector(drop.velocity, seconds)
                if (drop.life <= 0 || drop.mesh.position.y < ground(drop.mesh.position.x, drop.mesh.position.z)) drop.mesh.visible = false
            }
            for (const pool of pools) {
                if (!pool.mesh.visible) continue
                pool.age += seconds
                pool.mesh.scale.setScalar(pool.size * Math.min(1, 0.15 + pool.age / 6))
                ;(pool.mesh.material as THREE.MeshStandardMaterial).opacity = 0.85 * Math.min(1, (POOL_SECONDS - pool.age) / 20)
                if (pool.age >= POOL_SECONDS) pool.mesh.visible = false
            }
        },
    }
}
