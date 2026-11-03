/**
 * Armes à l'écran, faites de primitives : épée dans la main droite (elle suit le coup d'épée du modèle), arc dans la
 * main gauche, flèche qui file jusqu'à la cible, et gerbe d'éclats à l'impact.
 */
import * as THREE from 'three'
import type { WeaponId } from './combat'

const steel = new THREE.MeshStandardMaterial({color: 0xd4d8de, roughness: 0.25, metalness: 0.9})
const brass = new THREE.MeshStandardMaterial({color: 0xc29a3c, roughness: 0.4, metalness: 0.7})
const leather = new THREE.MeshStandardMaterial({color: 0x4a2e1c, roughness: 0.85})
const wood = new THREE.MeshStandardMaterial({color: 0x7a4f2a, roughness: 0.7})
const string = new THREE.LineBasicMaterial({color: 0xf2efe6})
const feather = new THREE.MeshStandardMaterial({color: 0xd8433b, roughness: 0.8, side: THREE.DoubleSide})

/** Épée longue d'environ 85 cm, la lame vers +Y depuis la poignée. */
function createSword() {
    const sword = new THREE.Group()
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), leather)
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), brass)
    pommel.position.y = -0.08
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.04), brass)
    guard.position.y = 0.08
    // Lame en losange : deux pans biseautés qui accrochent la lumière.
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.03, 0.66, 4), steel)
    blade.scale.z = 0.25
    blade.position.y = 0.42
    sword.add(grip, pommel, guard, blade)
    sword.traverse((object) => { object.castShadow = true })
    return sword
}

/** Arc droit d'environ 1,1 m (branches courbées, corde tendue), tenu par le milieu, la corde vers -Z. */
function createBow() {
    const bow = new THREE.Group()
    const limbs = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.014, 6, 24, 1.9), wood)
    limbs.rotation.z = Math.PI / 2 - 0.95
    limbs.position.x = -0.55
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), leather)
    grip.position.x = 0.07
    const tips = [0.95, -0.95].map((angle) => new THREE.Vector3(-0.55 + Math.cos(angle) * 0.62, Math.sin(angle) * 0.62, 0))
    const cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tips), string)
    bow.add(limbs, grip, cord)
    bow.rotation.y = Math.PI / 2
    bow.traverse((object) => { object.castShadow = object instanceof THREE.Mesh })
    return bow
}

function createArrow() {
    const arrow = new THREE.Group()
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.7, 6), wood)
    shaft.rotation.x = Math.PI / 2
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 6), steel)
    head.rotation.x = Math.PI / 2
    head.position.z = 0.38
    const fletching = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.1), feather)
    fletching.rotation.y = Math.PI / 2
    fletching.position.z = -0.3
    arrow.add(shaft, head, fletching)
    return arrow
}

/** Prise en main, en mètres dans le repère de l'os du poignet : la poignée dans le poing, pas dans le poignet. */
const SWORD_GRIP = new THREE.Vector3(0, 0.08, 0.02), BOW_GRIP = new THREE.Vector3(0, 0.08, 0)

interface Spark { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }

export function createWeaponView(scene: THREE.Scene, trainer: THREE.Object3D) {
    const sword = createSword(), bow = createBow(), arrow = createArrow()
    sword.visible = bow.visible = arrow.visible = false
    scene.add(arrow)
    let rightHand: THREE.Object3D | null = null, leftHand: THREE.Object3D | null = null
    const handScale = new THREE.Vector3()

    /**
     * Les armes deviennent enfants des os des mains dès que le modèle est chargé : elles suivent alors chaque
     * animation (garde, coup d'épée, visée). L'échelle de l'os (modèle réduit à la taille du dresseur) est compensée.
     */
    function attach() {
        rightHand ??= trainer.getObjectByName('WristR') ?? null
        leftHand ??= trainer.getObjectByName('WristL') ?? null
        if (rightHand && !sword.parent) {
            rightHand.add(sword)
            // Orientation mesurée sur le modèle : en garde (Idle_Sword), la lame pointe devant le dresseur, un peu vers le haut.
            sword.rotation.set(0, 0, Math.PI / 2)
        }
        if (leftHand && !bow.parent) leftHand.add(bow)
        for (const [weapon, hand, offset] of [[sword, rightHand, SWORD_GRIP], [bow, leftHand, BOW_GRIP]] as const) {
            if (!hand) continue
            // L'os n'est pas à l'échelle du monde : taille et décalage (en mètres) sont convertis dans son repère.
            hand.getWorldScale(handScale)
            const toBone = trainer.scale.x / Math.max(1e-6, handScale.x)
            weapon.scale.setScalar(toBone)
            weapon.position.copy(offset).multiplyScalar(toBone)
        }
    }

    // Éclats d'impact : petite réserve de cubes rouges et blancs projetés puis retombés.
    const sparks: Spark[] = []
    const sparkGeometry = new THREE.BoxGeometry(0.04, 0.04, 0.04)
    for (let index = 0; index < 24; index++) {
        const mesh = new THREE.Mesh(sparkGeometry, new THREE.MeshBasicMaterial({color: index % 3 ? 0xc81e1e : 0xf4f1ea}))
        mesh.visible = false
        scene.add(mesh)
        sparks.push({mesh, velocity: new THREE.Vector3(), life: 0})
    }
    let nextSpark = 0

    let flight: { from: THREE.Vector3; to: THREE.Vector3; t: number; duration: number } | null = null

    return {
        setScene(parent: THREE.Scene) {
            parent.add(arrow)
            arrow.visible = false; flight = null
            for (const spark of sparks) {parent.add(spark.mesh); spark.mesh.visible = false; spark.life = 0}
        },
        /** Arme tenue, ou aucune (poings, canne à pêche, vélo). */
        hold(weapon: WeaponId | null) {
            attach()
            sword.visible = weapon === 'sword'
            bow.visible = weapon === 'bow'
        },
        /** Flèche décochée de la main gauche vers `to` (coordonnées du monde). */
        shoot(to: THREE.Vector3) {
            const from = (leftHand ?? trainer).getWorldPosition(new THREE.Vector3())
            flight = {from, to: to.clone(), t: 0, duration: Math.max(0.08, from.distanceTo(to) / 35)}
            arrow.visible = true
        },
        /** Gerbe d'éclats au point touché ; plus fournie quand le coup tue. */
        burst(at: THREE.Vector3, killed: boolean) {
            for (let count = 0; count < (killed ? 14 : 6); count++) {
                const spark = sparks[nextSpark++ % sparks.length]
                spark.mesh.position.copy(at)
                spark.velocity.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3)
                spark.life = 0.5 + Math.random() * 0.3
                spark.mesh.visible = true
            }
        },
        update(seconds: number) {
            if (flight) {
                flight.t += seconds / flight.duration
                arrow.position.lerpVectors(flight.from, flight.to, Math.min(1, flight.t))
                arrow.lookAt(flight.to)
                if (flight.t >= 1) {
                    flight = null
                    arrow.visible = false
                }
            }
            for (const spark of sparks) {
                if (!spark.mesh.visible) continue
                spark.life -= seconds
                spark.velocity.y -= 9.8 * seconds
                spark.mesh.position.addScaledVector(spark.velocity, seconds)
                spark.mesh.rotation.x += seconds * 8
                if (spark.life <= 0) spark.mesh.visible = false
            }
        },
    }
}
