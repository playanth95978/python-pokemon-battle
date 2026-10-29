/**
 * Image de la pêche : canne qui plie sous la tension, fil qui pend ou se tend, flotteur qui danse puis plonge, ronds
 * dans l'eau, poisson entrevu sous la surface, sauts, et prise suspendue au bout du fil. Tout est fait de primitives.
 */
import * as THREE from 'three'
import type { FishingEvent, FishingState, FishSpecies } from './fishing'
import { flightTime } from './fishing'

const ROD_LENGTH = 2.1, ROD_SEGMENTS = 7
/** Inclinaison de la canne vers l'avant (0 : verticale) au repos, au départ du lancer (derrière l'épaule) et pendant le combat. */
const REST_TILT = 0.95, BACK_TILT = -0.55, FIGHT_TILT = 0.45
const LINE_POINTS = 40
/** Couleur et longueur relative (m pour 1 kg) de chaque poisson, pour l'apercevoir sous l'eau ou au bout du fil. */
const LOOKS: Record<string, { color: number; fin: number }> = {
    magikarp: {color: 0xe2572e, fin: 0xf2d27a}, goldeen: {color: 0xf3efe6, fin: 0xe8743a},
    poliwag: {color: 0x4c78c9, fin: 0x30416e}, barboach: {color: 0x8aa0a8, fin: 0x55666e},
    feebas: {color: 0x8c7450, fin: 0x4f6b9a}, gyarados: {color: 0x2f6fb5, fin: 0xf2efe0},
}

interface Ripple { mesh: THREE.Mesh; age: number; life: number; size: number }

export interface FishingView {
    /** `surface` : hauteur de l'eau en un point. `catchShown` : prise à montrer au bout du fil (après la sortie). */
    update(state: FishingState, dt: number, time: number, surface: (x: number, z: number) => number, events: FishingEvent[]): void
    /** Montre la prise suspendue au bout du fil, ou la range. */
    showCatch(fish: FishSpecies | null, weight?: number): void
}

export function createFishingView(scene: THREE.Scene, trainer: THREE.Object3D): FishingView {
    // Canne : segments emboîtés, du talon en liège au scion ; chacun plie un peu plus que le précédent.
    const rod = new THREE.Group()
    rod.visible = false
    trainer.add(rod)
    const blank = new THREE.MeshStandardMaterial({color: 0x2b2f36, roughness: 0.35, metalness: 0.2})
    const cork = new THREE.MeshStandardMaterial({color: 0xb08a5a, roughness: 0.9})
    const metal = new THREE.MeshStandardMaterial({color: 0x9aa1a8, roughness: 0.3, metalness: 0.8})
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.32, 10), cork)
    handle.position.y = 0.06
    rod.add(handle)
    const reel = new THREE.Group()
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), metal)
    spool.rotation.z = Math.PI / 2
    const crank = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.006), metal)
    crank.position.set(0.025, 0.02, 0)
    reel.add(spool, crank)
    reel.position.set(0, 0.12, 0.045)
    rod.add(reel)
    const joints: THREE.Group[] = []
    let parent: THREE.Object3D = rod
    const segment = ROD_LENGTH / ROD_SEGMENTS
    for (let index = 0; index < ROD_SEGMENTS; index++) {
        const joint = new THREE.Group()
        joint.position.y = index === 0 ? 0.2 : segment
        const bottom = 0.011 * (1 - index / ROD_SEGMENTS) + 0.002, top = 0.011 * (1 - (index + 1) / ROD_SEGMENTS) + 0.002
        const piece = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, segment, 6), blank)
        piece.position.y = segment / 2
        piece.castShadow = true
        joint.add(piece)
        // Anneaux de guidage.
        if (index % 2 === 1) {
            const guide = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0015, 4, 10), metal)
            guide.position.set(0, segment * 0.8, 0.012)
            joint.add(guide)
        }
        parent.add(joint)
        joints.push(joint)
        parent = joint
    }
    const tip = new THREE.Object3D()
    tip.position.y = segment
    parent.add(tip)

    // Fil : nylon fin, à peine visible.
    const linePositions = new Float32Array(LINE_POINTS * 3)
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
    const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({color: 0xeef2f0, transparent: true, opacity: 0.75}))
    line.frustumCulled = false
    line.visible = false
    scene.add(line)

    // Flotteur : gros et fluo, pour le suivre à huit mètres derrière le dresseur. Corps blanc, dôme rouge, antenne
    // orange et bout jaune lumineux, comme les flotteurs de nuit ; les teintes émissives le gardent lisible au crépuscule.
    const float = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({color: 0xfaf7ee, roughness: 0.35}))
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.072, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({color: 0xff2a1a, emissive: 0x9a1208, roughness: 0.35}))
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 8),
        new THREE.MeshStandardMaterial({color: 0xff8a1e, emissive: 0x8a3a00}))
    antenna.position.y = 0.13
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), new THREE.MeshStandardMaterial({color: 0xeaff3a, emissive: 0xc8e020}))
    beacon.position.y = 0.25
    float.add(body, cap, antenna, beacon)
    float.visible = false
    scene.add(float)
    // Collerette orange à la surface autour du flotteur : on le repère même quand la houle le cache à moitié.
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({color: 0xffa21e, transparent: true, opacity: 0.45, depthWrite: false}))
    halo.renderOrder = 2
    halo.visible = false
    scene.add(halo)

    // Ronds dans l'eau : une réserve d'anneaux qui s'élargissent et s'effacent.
    const ripples: Ripple[] = []
    const rippleGeometry = new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2)
    for (let index = 0; index < 12; index++) {
        const mesh = new THREE.Mesh(rippleGeometry, new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, depthWrite: false}))
        mesh.visible = false
        mesh.renderOrder = 2
        scene.add(mesh)
        ripples.push({mesh, age: 0, life: 0, size: 0})
    }
    let nextRipple = 0
    function ripple(x: number, y: number, z: number, size: number, life = 1.4) {
        const slot = ripples[nextRipple++ % ripples.length]
        slot.mesh.position.set(x, y + 0.005, z)
        Object.assign(slot, {age: 0, life, size})
        slot.mesh.visible = true
    }

    // Poisson : fuseau, nageoire caudale et dorsale, teinté selon l'espèce.
    const fish = new THREE.Group()
    const fishBody = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), new THREE.MeshStandardMaterial({roughness: 0.45}))
    fishBody.scale.set(0.38, 0.45, 1)
    const finMaterial = new THREE.MeshStandardMaterial({roughness: 0.6, side: THREE.DoubleSide})
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 4), finMaterial)
    tail.rotation.x = -Math.PI / 2
    tail.scale.set(0.15, 1, 1)
    tail.position.z = -0.6
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 4), finMaterial)
    dorsal.scale.set(0.15, 1, 1)
    dorsal.position.set(0, 0.25, 0.05)
    fish.add(fishBody, tail, dorsal)
    fish.visible = false
    scene.add(fish)
    function dress(species: FishSpecies, weight: number) {
        const look = LOOKS[species.speciesKey] ?? LOOKS.magikarp
        ;(fishBody.material as THREE.MeshStandardMaterial).color.setHex(look.color)
        finMaterial.color.setHex(look.fin)
        // Longueur à peu près proportionnelle à la racine cubique du poids.
        fish.scale.setScalar(Math.min(3, 0.22 * Math.cbrt(weight)))
    }

    // Jauge : puissance du lancer, puis tension du fil et longueur sortie pendant le combat.
    const gauge = document.createElement('div')
    gauge.className = 'world3d-fishing-gauge'
    gauge.setAttribute('aria-hidden', 'true')
    Object.assign(gauge.style, {
        position: 'fixed', left: '50%', bottom: '72px', width: '260px', marginLeft: '-130px', padding: '6px 8px',
        borderRadius: '8px', background: 'rgba(12, 18, 28, 0.72)', color: '#f4efe2', font: '12px system-ui, sans-serif',
        display: 'none', pointerEvents: 'none',
    })
    gauge.innerHTML = '<div class="label"></div><div style="height:8px;border-radius:4px;background:#2c3440;overflow:hidden;margin-top:4px">'
        + '<div class="bar" style="height:100%;width:0"></div></div>'
    document.body.appendChild(gauge)
    const gaugeLabel = gauge.querySelector<HTMLElement>('.label')!, gaugeBar = gauge.querySelector<HTMLElement>('.bar')!
    function drawGauge(state: FishingState) {
        const shown = state.phase === 'fight'
        gauge.style.display = shown ? 'block' : 'none'
        if (!shown) return
        const value = Math.min(1, state.tension)
        gaugeBar.style.width = `${Math.round(value * 100)}%`
        // Vert, puis orange, puis rouge quand le fil approche de la rupture.
        gaugeBar.style.background = value < 0.7 ? '#5fae5a' : value < 0.9 ? '#e39b32' : '#d8433b'
        gaugeLabel.textContent = value >= 0.9 ? 'Relâche F, le fil va casser !'
            : `Tension du fil · ${state.line.toFixed(1)} m sortis${state.tension < 0.12 ? ' · fil mou, mouline !' : ''}`
    }

    let jump = -1, hooked: FishSpecies | null = null, shown: { fish: FishSpecies; weight: number } | null = null
    let shake = 0, castTime = 0
    const tipWorld = new THREE.Vector3(), floatWorld = new THREE.Vector3(), control = new THREE.Vector3(), point = new THREE.Vector3()
    const wristWorld = new THREE.Vector3()
    let wrist: THREE.Object3D | null = null

    /** Courbe du fil : du scion au flotteur, en creux selon le mou (au repos, il touche l'eau près du flotteur). */
    function drawLine(from: THREE.Vector3, to: THREE.Vector3, sag: number, floor: number) {
        control.lerpVectors(from, to, 0.55)
        control.y = Math.max(floor, Math.min(from.y, to.y) - sag)
        for (let index = 0; index < LINE_POINTS; index++) {
            const t = index / (LINE_POINTS - 1), u = 1 - t
            point.set(
                u * u * from.x + 2 * u * t * control.x + t * t * to.x,
                Math.max(floor, u * u * from.y + 2 * u * t * control.y + t * t * to.y),
                u * u * from.z + 2 * u * t * control.z + t * t * to.z,
            )
            point.toArray(linePositions, index * 3)
        }
        lineGeometry.attributes.position.needsUpdate = true
    }

    return {
        showCatch(species, weight = 1) {
            shown = species ? {fish: species, weight} : null
            if (species) dress(species, weight)
        },
        update(state, dt, time, surface, events) {
            const active = state.phase !== 'idle' || shown !== null
            rod.visible = active
            line.visible = active
            float.visible = state.phase === 'waiting' || state.phase === 'bite' || state.phase === 'casting'
            halo.visible = state.phase === 'waiting' || state.phase === 'bite'
            if (!active) {
                fish.visible = false
                jump = -1
            }

            for (const event of events) {
                const y = surface(state.float.x, state.float.z)
                if (event.type === 'cast') castTime = time
                if (event.type === 'splash') ripple(state.float.x, y, state.float.z, 0.5, 1.8)
                if (event.type === 'nibble') ripple(state.float.x, y, state.float.z, 0.18, 0.9)
                if (event.type === 'bite') ripple(state.float.x, y, state.float.z, 0.35, 1.2)
                if (event.type === 'hooked') {
                    hooked = event.fish
                    dress(event.fish, 6)
                    shake = 0.4
                }
                if (event.type === 'jump') jump = 0
                if (event.type === 'snap' || event.type === 'unhooked') {
                    ripple(state.float.x, y, state.float.z, 0.4, 1.2)
                    hooked = null
                }
            }
            if (state.phase === 'fight' && state.weight && hooked) dress(hooked, state.weight)

            // La canne part de la main droite du modèle (ou d'une main supposée tant qu'il charge).
            // GLTFLoader retire les points des noms d'os : « Wrist.R » devient « WristR ».
            wrist ??= trainer.getObjectByName('WristR') ?? null
            if (wrist) rod.position.copy(trainer.worldToLocal(wrist.getWorldPosition(wristWorld)))
            else rod.position.set(-0.22, 0.85, 0.2)
            rod.position.y -= 0.05

            // Inclinaison : passée derrière l'épaule puis fouettée vers l'avant au lancer, relevée pendant le combat.
            let tilt = REST_TILT, bend = 0
            if (state.phase === 'casting') {
                const swing = (time - castTime) / 0.3
                tilt = swing < 0.5 ? THREE.MathUtils.lerp(REST_TILT, BACK_TILT, swing * 2) : THREE.MathUtils.lerp(BACK_TILT, REST_TILT + 0.25, Math.min(1, swing * 2 - 1))
            }
            else if (state.phase === 'fight') {
                tilt = FIGHT_TILT
                bend = Math.min(1.3, state.tension) * 0.75
            } else if (shown) {
                tilt = 0.55
                bend = 0.25
            } else if (state.phase === 'bite') bend = 0.08
            rod.rotation.x = THREE.MathUtils.lerp(rod.rotation.x, tilt, Math.min(1, dt * (state.phase === 'casting' ? 30 : 8)))
            // Le poisson tire sur le côté : la canne suit.
            rod.rotation.z = THREE.MathUtils.lerp(rod.rotation.z, state.phase === 'fight' ? -state.angle * 0.5 : 0, Math.min(1, dt * 4))
            shake = Math.max(0, shake - dt)
            joints.forEach((joint, index) => {
                const along = (index + 1) / ROD_SEGMENTS
                joint.rotation.x = bend * along * along * 0.55 + Math.sin(time * 40) * shake * 0.03
            })
            tip.getWorldPosition(tipWorld)

            const water = surface(state.float.x, state.float.z)
            const bob = Math.sin(time * 2.1 + state.float.x) * 0.006
            if (state.phase === 'casting') {
                // Vol en cloche, du scion au point d'impact.
                const progress = Math.min(1, state.elapsed / flightTime(state.line))
                floatWorld.lerpVectors(tipWorld, point.set(state.float.x, water, state.float.z), progress)
                floatWorld.y += Math.sin(progress * Math.PI) * (0.8 + state.line * 0.18) - progress * 0.02
                float.position.copy(floatWorld)
                drawLine(tipWorld, floatWorld, 0.05, -Infinity)
            } else if (state.phase === 'waiting' || state.phase === 'bite') {
                // À la touche, le corps coule et seul le bout lumineux dépasse, en clignotant ; la collerette pulse.
                let dip = 0
                if (state.phase === 'bite') dip = 0.17 + Math.sin(time * 25) * 0.015
                else if (state.elapsed < 0.3 && state.fish) dip = Math.sin(state.elapsed / 0.3 * Math.PI) * 0.06
                float.position.set(state.float.x, water + bob - 0.03 - dip, state.float.z)
                float.rotation.z = Math.sin(time * 1.3) * 0.08
                beacon.visible = state.phase !== 'bite' || Math.sin(time * 18) > -0.3
                halo.position.set(state.float.x, water + 0.006, state.float.z)
                const pulse = state.phase === 'bite' ? 1 + Math.abs(Math.sin(time * 9)) * 1.2 : 1
                halo.scale.setScalar(pulse)
                ;(halo.material as THREE.MeshBasicMaterial).opacity = state.phase === 'bite' ? 0.75 : 0.45
                // Le fil repose sur l'eau près du flotteur : il en part presque à plat.
                drawLine(tipWorld, float.position, 1.2, water)
            } else if (state.phase === 'fight') {
                floatWorld.set(state.float.x, water - 0.08, state.float.z)
                drawLine(tipWorld, floatWorld, Math.max(0, 0.5 - state.tension) * 0.6, water - 0.08)
                // Le poisson ferré : entrevu sous la surface quand il approche, qui fend l'eau pendant les rushs.
                const near = state.line < 4
                fish.visible = near || jump >= 0
                fish.position.copy(floatWorld)
                // Sous la surface : on n'en voit que la silhouette à travers l'eau.
                fish.position.y = water - 0.2 - 0.3 * fish.scale.x
                fish.rotation.set(0, Math.atan2(state.float.x - tipWorld.x, state.float.z - tipWorld.z) + Math.sin(time * 9) * 0.25, 0)
                if (jump >= 0) {
                    jump += dt
                    const t = jump / 0.7
                    fish.position.y = water + Math.sin(Math.min(1, t) * Math.PI) * 0.7
                    fish.rotation.x = (t - 0.5) * 2
                    if (jump > 0.7) {
                        ripple(floatWorld.x, water, floatWorld.z, 0.6, 1.5)
                        jump = -1
                    }
                }
                if (state.pull > 0.5 && Math.random() < dt * 6) ripple(floatWorld.x, water, floatWorld.z, 0.12 + state.pull * 0.2, 0.8)
            } else if (shown) {
                // La prise, sortie de l'eau, pend au bout du fil en gigotant.
                fish.visible = true
                fish.position.set(tipWorld.x, tipWorld.y - 0.35 - 0.3 * fish.scale.x, tipWorld.z)
                fish.rotation.set(-Math.PI / 2 + Math.sin(time * 14) * 0.3, time, 0)
                floatWorld.copy(fish.position)
                floatWorld.y += 0.3 * fish.scale.x
                drawLine(tipWorld, floatWorld, 0, -Infinity)
            }

            drawGauge(state)
            for (const slot of ripples) {
                if (!slot.mesh.visible) continue
                slot.age += dt
                const t = slot.age / slot.life
                if (t >= 1) {
                    slot.mesh.visible = false
                    continue
                }
                slot.mesh.scale.setScalar(slot.size * (0.2 + t * 1.6))
                ;(slot.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.55
            }
        },
    }
}
