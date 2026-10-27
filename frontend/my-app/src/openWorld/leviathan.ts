/**
 * Léviathan : serpent de mer original (construit en code, aucun modèle tiré des jeux). Son corps est un tube
 * recalculé à chaque image le long de la trace de la tête : ondulations latérales, bosses qui émergent, cou
 * qui se dresse pour attaquer. Embruns, Hydrocanon et Ouragan sont des particules.
 */
import * as THREE from 'three'
import type { LeviathanAttack, Point } from './leviathanMotion'
import { canChallenge, createLeviathanState, rearAmount, spinePoints, stepLeviathan } from './leviathanMotion'
import type { WorldGenerator } from './worldGenerator'
import { SEA_LEVEL } from './worldGenerator'

const RINGS = 44, SIDES = 16
const WATER_Y = SEA_LEVEL - 0.15
/** Au-delà, la bête n'est ni simulée ni dessinée. */
const ACTIVE_DISTANCE = 160
const BACK = new THREE.Color(0x1d4f9c), BELLY = new THREE.Color(0xe6d6a2), FIN = 0xc8463a

/** Rayon du corps le long de sa longueur (t = 0 à la nuque, 1 au bout de la queue). */
function radiusAt(t: number) {
    return 0.62 * Math.min(1, 0.78 + t * 2.2) * Math.pow(1 - t, 0.75) + 0.04
}

/** Écailles : demi-cercles en quinconce, utilisés en relief et en rugosité. */
function scaleTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const context = canvas.getContext('2d')!
    context.fillStyle = '#808080'
    context.fillRect(0, 0, 128, 128)
    for (let row = -1; row < 9; row++) {
        for (let column = -1; column < 9; column++) {
            const x = column * 16 + (row % 2) * 8, y = row * 16
            const gradient = context.createRadialGradient(x, y, 2, x, y, 11)
            gradient.addColorStop(0, '#d0d0d0')
            gradient.addColorStop(0.85, '#7a7a7a')
            gradient.addColorStop(1, '#3a3a3a')
            context.fillStyle = gradient
            context.beginPath()
            context.arc(x, y, 11, 0, Math.PI)
            context.fill()
        }
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    return texture
}

function bodyGeometry() {
    const count = RINGS * (SIDES + 1)
    const geometry = new THREE.BufferGeometry()
    const colors = new Float32Array(count * 3), uvs = new Float32Array(count * 2), indices: number[] = []
    const color = new THREE.Color()
    for (let ring = 0; ring < RINGS; ring++) {
        for (let side = 0; side <= SIDES; side++) {
            const index = ring * (SIDES + 1) + side
            const angle = side / SIDES * Math.PI * 2
            // Dos bleu profond, ventre crème, transition nette comme sur une vraie robe de serpent.
            color.copy(BACK).lerp(BELLY, THREE.MathUtils.smoothstep(-Math.sin(angle), -0.1, 0.35))
            color.toArray(colors, index * 3)
            uvs.set([side / SIDES * 3, ring / (RINGS - 1) * 26], index * 2)
            if (ring < RINGS - 1 && side < SIDES) {
                const next = index + SIDES + 1
                // Faces tournées vers l'extérieur (sens trigonométrique vu du dehors).
                indices.push(index, index + 1, next, index + 1, next + 1, next)
            }
        }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    return geometry
}

/** Tête : crâne allongé, mâchoire articulée, dents, yeux luisants, crête et barbillons. */
function createHead(material: THREE.Material, finMaterial: THREE.Material) {
    const head = new THREE.Group()
    const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, mesh: THREE.Material, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) => {
        const part = new THREE.Mesh(geometry, mesh)
        part.position.set(...position)
        part.rotation.set(...rotation)
        part.castShadow = true
        parent.add(part)
        return part
    }
    add(head, new THREE.SphereGeometry(0.5, 20, 14).scale(1.05, 0.85, 1.25), material, [0, 0.05, 0])
    add(head, new THREE.CapsuleGeometry(0.27, 0.75, 6, 14).rotateX(Math.PI / 2).scale(1.15, 0.75, 1), material, [0, 0.08, 0.72])
    const jaw = new THREE.Group()
    jaw.position.set(0, -0.12, 0.2)
    head.add(jaw)
    add(jaw, new THREE.CapsuleGeometry(0.22, 0.75, 6, 12).rotateX(Math.PI / 2).scale(1.1, 0.55, 1), material, [0, -0.1, 0.5])
    const tooth = new THREE.ConeGeometry(0.035, 0.14, 5)
    const ivory = new THREE.MeshStandardMaterial({color: 0xf4efe0, roughness: 0.4})
    for (let index = 0; index < 6; index++) {
        for (const side of [-1, 1]) {
            add(head, tooth, ivory, [side * (0.24 - index * 0.012), -0.07, 0.45 + index * 0.13], [Math.PI, 0, 0])
            add(jaw, tooth, ivory, [side * (0.2 - index * 0.012), 0.02, 0.35 + index * 0.12])
        }
    }
    const eye = new THREE.MeshStandardMaterial({color: 0x330000, emissive: 0xff5a1f, emissiveIntensity: 2.2, roughness: 0.2})
    for (const side of [-1, 1]) {
        add(head, new THREE.SphereGeometry(0.075, 12, 8), eye, [side * 0.36, 0.24, 0.42])
        // Barbillons : longs filaments qui partent du museau et retombent vers l'arrière.
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * 0.22, 0.02, 1.05), new THREE.Vector3(side * 0.6, -0.05, 0.9),
            new THREE.Vector3(side * 0.95, -0.25, 0.4), new THREE.Vector3(side * 1.2, -0.5, -0.2),
        ])
        add(head, new THREE.TubeGeometry(curve, 16, 0.025, 5), finMaterial, [0, 0, 0])
        add(head, new THREE.ConeGeometry(0.12, 0.7, 4).scale(1, 1, 0.3), finMaterial, [side * 0.45, 0.1, -0.15], [-0.9, 0, side * 0.9])
    }
    for (let index = 0; index < 3; index++) {
        add(head, new THREE.ConeGeometry(0.16 - index * 0.03, 0.9 - index * 0.15, 4).scale(0.3, 1, 1), finMaterial,
            [0, 0.42 - index * 0.05, 0.1 - index * 0.32], [-1.1, 0, 0])
    }
    add(head, new THREE.ConeGeometry(0.07, 0.45, 6), new THREE.MeshStandardMaterial({color: 0xe8e2cf, roughness: 0.5}), [0, 0.38, 0.55], [0.5, 0, 0])
    return {head, jaw}
}

type ParticleKind = 'spray' | 'jet' | 'vortex'

/** Réserve de particules d'eau : embruns, jet d'Hydrocanon et tourbillon d'Ouragan. */
function createParticles(scene: THREE.Scene, capacity = 900) {
    const positions = new Float32Array(capacity * 3), alphas = new Float32Array(capacity), sizes = new Float32Array(capacity)
    const velocity = new Float32Array(capacity * 3), life = new Float32Array(capacity), maxLife = new Float32Array(capacity)
    const kinds: ParticleKind[] = new Array(capacity).fill('spray')
    // Par particule de tourbillon : angle, hauteur atteinte, centre (x, y, z).
    const vortex = new Float32Array(capacity * 5)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage))
    const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: {scale: {value: 400}},
        vertexShader: `
            attribute float alpha;
            attribute float size;
            uniform float scale;
            varying float vAlpha;
            void main() {
                vAlpha = alpha;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * scale / -mvPosition.z;
                gl_Position = projectionMatrix * mvPosition;
            }`,
        fragmentShader: `
            varying float vAlpha;
            void main() {
                float distance = length(gl_PointCoord - 0.5);
                if (distance > 0.5) discard;
                gl_FragColor = vec4(vec3(0.88, 0.95, 1.0) * 1.6, vAlpha * smoothstep(0.5, 0.15, distance));
            }`,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    let next = 0

    const emit = (kind: ParticleKind, origin: THREE.Vector3, direction: THREE.Vector3, seconds: number, size: number) => {
        const index = next
        next = (next + 1) % capacity
        kinds[index] = kind
        origin.toArray(positions, index * 3)
        direction.toArray(velocity, index * 3)
        life[index] = maxLife[index] = seconds
        sizes[index] = size
    }
    const random = new THREE.Vector3(), splash = new THREE.Vector3()
    const spray = (origin: THREE.Vector3, count: number, speed: number, size = 0.18) => {
        for (let index = 0; index < count; index++) {
            random.set((Math.random() - 0.5) * speed, speed * (0.6 + Math.random()), (Math.random() - 0.5) * speed)
            emit('spray', origin, random, 0.6 + Math.random() * 0.6, size * (0.6 + Math.random() * 0.8))
        }
    }
    return {
        spray,
        jet(origin: THREE.Vector3, target: THREE.Vector3, count: number) {
            const distance = origin.distanceTo(target), speed = 24
            for (let index = 0; index < count; index++) {
                random.subVectors(target, origin).normalize().multiplyScalar(speed)
                random.x += (Math.random() - 0.5) * 1.6
                random.y += (Math.random() - 0.5) * 1.6 + distance * 0.12
                random.z += (Math.random() - 0.5) * 1.6
                emit('jet', origin, random, distance / speed, 0.28 + Math.random() * 0.2)
            }
        },
        vortex(center: THREE.Vector3, count: number) {
            for (let index = 0; index < count; index++) {
                const slot = next
                emit('vortex', center, random.set(0, 0, 0), 1.4 + Math.random() * 0.6, 0.22 + Math.random() * 0.2)
                // La particule monte en spirale autour du dresseur, de plus en plus large.
                vortex.set([Math.random() * Math.PI * 2, Math.random() * 0.4, center.x, center.y, center.z], slot * 5)
            }
        },
        update(dt: number) {
            for (let index = 0; index < capacity; index++) {
                if (life[index] <= 0) {
                    alphas[index] = 0
                    continue
                }
                life[index] -= dt
                const offset = index * 3
                if (kinds[index] === 'vortex') {
                    const slot = index * 5
                    vortex[slot] += dt * 7
                    vortex[slot + 1] += dt * 3.2
                    const height = vortex[slot + 1], radius = 0.5 + height * 0.35
                    positions[offset] = vortex[slot + 2] + Math.cos(vortex[slot]) * radius
                    positions[offset + 1] = vortex[slot + 3] + height
                    positions[offset + 2] = vortex[slot + 4] + Math.sin(vortex[slot]) * radius
                } else {
                    velocity[offset + 1] -= (kinds[index] === 'jet' ? 2.5 : 9.8) * dt
                    positions[offset] += velocity[offset] * dt
                    positions[offset + 1] += velocity[offset + 1] * dt
                    positions[offset + 2] += velocity[offset + 2] * dt
                    // Le jet éclate en gerbe en arrivant sur sa cible.
                    if (kinds[index] === 'jet' && life[index] <= 0) spray(splash.fromArray(positions, offset), 3, 3.5, 0.2)
                }
                alphas[index] = Math.min(1, life[index] / maxLife[index] * 2) * 0.85
            }
            geometry.attributes.position.needsUpdate = true
            geometry.attributes.alpha.needsUpdate = true
            geometry.attributes.size.needsUpdate = true
        },
    }
}

export interface LeviathanFrame {
    /** Message pour le HUD, ou `null` si la bête est loin ou calme. */
    message: string | null
    /** Secousse de caméra voulue (unités du monde). */
    shake: number
}

export function createLeviathan(world: WorldGenerator, scene: THREE.Scene, home: Point) {
    const state = createLeviathanState(world, home)
    if (!state) return null
    const scales = scaleTexture()
    const material = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.4, metalness: 0.05, envMapIntensity: 0.8,
        bumpMap: scales, bumpScale: 1.5,
    })
    const finMaterial = new THREE.MeshStandardMaterial({color: FIN, roughness: 0.45, side: THREE.DoubleSide})
    const geometry = bodyGeometry()
    const body = new THREE.Mesh(geometry, material)
    body.castShadow = true
    body.receiveShadow = true
    body.frustumCulled = false
    // La tête n'a pas de couleurs de sommets : elle prend la couleur du dos, avec les mêmes écailles.
    const headMaterial = new THREE.MeshStandardMaterial({color: BACK, roughness: 0.4, envMapIntensity: 0.8, bumpMap: scales, bumpScale: 1.5})
    const {head, jaw} = createHead(headMaterial, finMaterial)
    const finGeometry = new THREE.ConeGeometry(0.22, 0.75, 4).scale(0.25, 1, 1).translate(0, 0.3, 0)
    const fins = new THREE.InstancedMesh(finGeometry, finMaterial, Math.floor((RINGS - 8) / 2))
    fins.castShadow = true
    fins.frustumCulled = false
    const fluke = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([
        new THREE.Vector2(0, 0), new THREE.Vector2(-0.9, 0.9), new THREE.Vector2(-0.3, 0.15),
        new THREE.Vector2(0, 1.1), new THREE.Vector2(0.3, 0.15), new THREE.Vector2(0.9, 0.9),
    ])), finMaterial)
    fluke.castShadow = true
    const root = new THREE.Group()
    root.add(body, head, fins, fluke)
    scene.add(root)
    const particles = createParticles(scene)

    const position = geometry.attributes.position as THREE.BufferAttribute, normal = geometry.attributes.normal as THREE.BufferAttribute
    const spine = Array.from({length: RINGS}, () => new THREE.Vector3())
    const tangent = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), radial = new THREE.Vector3()
    const lastSide = new THREE.Vector3(1, 0, 0), matrix = new THREE.Matrix4(), mouth = new THREE.Vector3(), target = new THREE.Vector3()
    const forward = new THREE.Vector3(), look = new THREE.Vector3()
    let attackFired = 0

    function shapeBody(time: number, player: THREE.Vector3) {
        const lift = rearAmount(state!)
        const points = spinePoints(state!, RINGS)
        for (let ring = 0; ring < RINGS; ring++) {
            const t = ring / (RINGS - 1)
            // Bosses qui émergent et voyagent de la tête vers la queue, plus marquées au milieu du corps.
            const hump = Math.sin(time * 2.3 - t * 13) * 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.4))
            // Le cou se dresse : la tête monte à 4 unités au-dessus de l'eau, le reste du corps reste nageur.
            const neck = Math.max(0, 1 - t / 0.32)
            // Le dos affleure : la moitié haute du corps reste hors de l'eau, sinon l'écume des eaux minces le recouvre.
            spine[ring].set(points[ring].x, WATER_Y + 0.08 + hump * (1 - lift * neck) + lift * 4.2 * neck * neck, points[ring].z)
        }
        // Ondulation latérale : l'amplitude croît vers la queue, comme une anguille.
        for (let ring = 1; ring < RINGS; ring++) {
            const t = ring / (RINGS - 1)
            tangent.subVectors(spine[ring - 1], spine[ring]).setY(0).normalize()
            side.set(tangent.z, 0, -tangent.x)
            spine[ring].addScaledVector(side, Math.sin(time * 3.1 - t * 9) * 0.32 * t)
        }
        for (let ring = 0; ring < RINGS; ring++) {
            const t = ring / (RINGS - 1), radius = radiusAt(t)
            const before = spine[Math.max(0, ring - 1)], after = spine[Math.min(RINGS - 1, ring + 1)]
            tangent.subVectors(after, before).normalize()
            side.crossVectors(THREE.Object3D.DEFAULT_UP, tangent)
            // Cou presque vertical : on garde le côté précédent pour ne pas tordre le tube.
            if (side.lengthSq() < 0.02) side.copy(lastSide)
            side.normalize()
            lastSide.copy(side)
            up.crossVectors(tangent, side).normalize()
            for (let index = 0; index <= SIDES; index++) {
                const angle = index / SIDES * Math.PI * 2
                radial.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle) * 0.86)
                const vertex = ring * (SIDES + 1) + index
                position.setXYZ(vertex, spine[ring].x + radial.x * radius, spine[ring].y + radial.y * radius, spine[ring].z + radial.z * radius)
                radial.normalize()
                normal.setXYZ(vertex, radial.x, radial.y, radial.z)
            }
            if (ring >= 3 && ring < RINGS - 5 && ring % 2 === 1) {
                // Nageoire dorsale penchée vers la queue, à la taille du corps à cet endroit.
                radial.copy(up).multiplyScalar(0.85).addScaledVector(tangent, 0.45).normalize()
                forward.crossVectors(side, radial)
                matrix.makeBasis(side, radial, forward).scale(radial.set(radius * 1.6, radius * 1.6, radius * 1.6))
                matrix.setPosition(spine[ring].x + up.x * radius * 0.8, spine[ring].y + up.y * radius * 0.8, spine[ring].z + up.z * radius * 0.8)
                fins.setMatrixAt((ring - 3) >> 1, matrix)
            }
            // Embruns là où le corps fend la surface.
            if (Math.abs(spine[ring].y + radius * 0.6 - WATER_Y) < 0.1 && Math.random() < 0.015) particles.spray(spine[ring], 1, 1.6, 0.12)
        }
        position.needsUpdate = true
        normal.needsUpdate = true
        fins.instanceMatrix.needsUpdate = true

        // Queue : nageoire caudale dans l'axe du dernier anneau.
        const tail = spine[RINGS - 1]
        tangent.subVectors(spine[RINGS - 2], tail).normalize()
        fluke.position.copy(tail)
        fluke.lookAt(look.copy(tail).sub(tangent))
        fluke.rotateX(Math.PI / 2)

        // Tête : dans l'axe du cou en nageant, tournée vers le dresseur une fois dressée.
        head.position.copy(spine[0])
        forward.subVectors(spine[0], spine[1]).normalize()
        look.copy(player).setY(player.y + 0.8).sub(spine[0]).normalize()
        forward.lerp(look, lift).normalize()
        head.lookAt(look.copy(spine[0]).add(forward))
        jaw.rotation.x = state!.phase === 'attack' ? 0.75 : lift * 0.35
        return lift
    }

    return {
        state,
        /** Assez près pour lancer le combat (touche E). */
        canChallenge: (player: THREE.Vector3) => canChallenge(state, {x: player.x, z: player.z}),
        /** Défié, il se dresse aussitôt et attaque pendant la transition vers le combat. */
        provoke() {
            state.cooldown = 0
        },
        update(dt: number, time: number, player: THREE.Vector3): LeviathanFrame {
            const distance = Math.hypot(player.x - state.x, player.z - state.z)
            root.visible = distance < ACTIVE_DISTANCE
            if (!root.visible) return {message: null, shake: 0}
            const previous = state.phase
            stepLeviathan(world, state, dt, {x: player.x, z: player.z})
            shapeBody(time, player)
            head.updateMatrixWorld()
            mouth.set(0, -0.05, 1.25).applyMatrix4(head.matrixWorld)
            target.copy(player).setY(player.y + 0.9)
            let shake = 0
            if (state.phase === 'rear' && previous === 'swim') {
                particles.spray(head.position, 60, 5, 0.3)
                attackFired = 0
            }
            if (state.phase === 'attack') {
                attackFired += dt
                if (state.attack === 'Hydrocanon' && attackFired > 0.15 && attackFired < 1.4) {
                    particles.jet(mouth, target, 14)
                    shake = 0.08
                }
                if (state.attack === 'Ouragan' && attackFired < 1.3) {
                    particles.vortex(target.setY(player.y), 10)
                    shake = 0.12
                }
            }
            if (state.phase === 'swim' && previous === 'dive') particles.spray(head.position, 40, 4, 0.26)
            particles.update(dt)
            const attacking = state.phase !== 'swim'
            const message = attacking ? attackMessage(state.attack!)
                : canChallenge(state, {x: player.x, z: player.z}) ? 'E : affronter le Léviathan !'
                    : distance < 45 ? 'Un Léviathan rôde dans la rivière… approche-toi pour l’affronter.' : null
            return {message, shake}
        },
    }
}

function attackMessage(attack: LeviathanAttack) {
    return `Le Léviathan utilise ${attack} !`
}
