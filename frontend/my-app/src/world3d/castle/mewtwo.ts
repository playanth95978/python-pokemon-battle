/**
 * Mewtwo stylisé, construit en code comme les autres modèles du POC : aucun maillage ni texture extraits des jeux.
 * Silhouette organique : membres en tubes effilés le long de courbes, cuisses massives, torse fin, ventre violet
 * prolongé par une longue queue épaisse. Il flotte devant le trône, entouré d'une aura et de pierres en lévitation.
 */
import * as THREE from 'three'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// Teintes soutenues : sous la lumière mauve de la salle du trône, un lavande trop clair vire au blanc.
const SKIN = new THREE.MeshPhysicalMaterial({color: 0xc9bdd6, roughness: 0.55, sheen: 0.6, sheenColor: 0xf0e6ff, sheenRoughness: 0.5})
const PURPLE = new THREE.MeshPhysicalMaterial({color: 0x7341a6, roughness: 0.45, sheen: 0.4, sheenColor: 0xc9a0ff})
const EYE = new THREE.MeshStandardMaterial({color: 0x3a0f5c, emissive: 0x9b3dff, emissiveIntensity: 1.4, roughness: 0.15})
const PUPIL = new THREE.MeshBasicMaterial({color: 0x12041c})

const TUBULAR = 24
const RADIAL = 16

/** Rayon le long du tube : interpolation linéaire entre des rayons répartis régulièrement. */
function radiusAt(radii: number[], t: number) {
    const position = t * (radii.length - 1)
    const index = Math.min(radii.length - 2, Math.floor(position))
    return THREE.MathUtils.lerp(radii[index], radii[index + 1], position - index)
}

/** Remplit un tube de rayon variable qui suit une courbe passant par les points donnés. */
function fillTube(geometry: THREE.BufferGeometry, points: THREE.Vector3[], radii: number[]) {
    const curve = new THREE.CatmullRomCurve3(points)
    const frames = curve.computeFrenetFrames(TUBULAR, false)
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    const normal = geometry.getAttribute('normal') as THREE.BufferAttribute
    const center = new THREE.Vector3(), direction = new THREE.Vector3()
    for (let i = 0; i <= TUBULAR; i++) {
        const t = i / TUBULAR
        curve.getPointAt(t, center)
        const radius = radiusAt(radii, t)
        for (let j = 0; j <= RADIAL; j++) {
            const angle = j / RADIAL * Math.PI * 2
            direction.copy(frames.normals[i]).multiplyScalar(Math.cos(angle)).addScaledVector(frames.binormals[i], Math.sin(angle))
            const index = i * (RADIAL + 1) + j
            normal.setXYZ(index, direction.x, direction.y, direction.z)
            position.setXYZ(index, center.x + direction.x * radius, center.y + direction.y * radius, center.z + direction.z * radius)
        }
    }
    position.needsUpdate = true
    normal.needsUpdate = true
    geometry.computeBoundingSphere()
}

function taperedTube(points: THREE.Vector3[], radii: number[]) {
    const geometry = new THREE.BufferGeometry()
    const count = (TUBULAR + 1) * (RADIAL + 1)
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    const indices: number[] = []
    for (let i = 0; i < TUBULAR; i++) {
        for (let j = 0; j < RADIAL; j++) {
            const a = i * (RADIAL + 1) + j, b = a + RADIAL + 1
            indices.push(a, a + 1, b, a + 1, b + 1, b)
        }
    }
    geometry.setIndex(indices)
    fillTube(geometry, points, radii)
    return geometry
}

/** Volume de révolution (torse, ventre) à partir d'un profil [rayon, hauteur], écrasé en profondeur. */
function lathe(profile: [number, number][], scaleX: number, scaleZ: number) {
    return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 32).scale(scaleX, 1, scaleZ)
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, at?: THREE.Vector3) {
    const part = new THREE.Mesh(geometry, material)
    if (at) part.position.copy(at)
    part.castShadow = true
    part.receiveShadow = true
    parent.add(part)
    return part
}

const ball = (radius: number, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(radius, 20, 14).scale(sx, sy, sz)

/** Aura : coque transparente plus lumineuse sur les bords (effet de Fresnel), qui pulse. */
function auraMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
        uniforms: {time: {value: 0}},
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                vNormal = normalize(mat3(modelMatrix) * normal);
                vView = normalize(cameraPosition - world.xyz);
                gl_Position = projectionMatrix * viewMatrix * world;
            }`,
        fragmentShader: `
            uniform float time;
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
                float rim = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
                float pulse = 0.75 + 0.25 * sin(time * 2.2);
                // Un simple liseré qui respire : il ne délave pas Mewtwo derrière lui.
                gl_FragColor = vec4(vec3(0.45, 0.18, 1.0) * rim * pulse * 0.5, rim * pulse * 0.4);
            }`,
    })
}

/** Bras : épaule, coude, poignet, puis trois doigts courts terminés par une boule. */
function createArm(side: number) {
    const arm = new THREE.Group()
    arm.position.set(side * 0.3, 1.66, -0.01)
    mesh(ball(0.085), SKIN, arm)
    mesh(taperedTube([V(0, 0, 0), V(side * 0.06, -0.15, 0.01), V(side * 0.1, -0.3, 0.02)], [0.07, 0.055, 0.045]), SKIN, arm)
    mesh(ball(0.045), SKIN, arm, V(side * 0.1, -0.3, 0.02))
    mesh(taperedTube([V(side * 0.1, -0.3, 0.02), V(side * 0.12, -0.44, 0.07), V(side * 0.13, -0.56, 0.12)], [0.045, 0.04, 0.032]), SKIN, arm)
    const hand = new THREE.Group()
    hand.position.set(side * 0.13, -0.58, 0.13)
    mesh(ball(0.045, 1, 0.8, 1.1), SKIN, hand)
    for (const finger of [-1, 0, 1]) {
        const tip = V(finger * 0.035, -0.08, 0.03 + (finger === 0 ? 0.02 : 0))
        mesh(taperedTube([V(finger * 0.02, -0.02, 0.01), tip.clone().multiplyScalar(0.5), tip], [0.018, 0.016, 0.015]), SKIN, hand)
        mesh(ball(0.026), SKIN, hand, tip)
    }
    arm.add(hand)
    return arm
}

/** Jambe digitigrade : cuisse massive, tibia fin, pied à trois orteils. */
function createLeg(side: number, parent: THREE.Object3D) {
    const hip = V(side * 0.15, 1.02, -0.02), knee = V(side * 0.21, 0.6, 0.1), ankle = V(side * 0.21, 0.16, -0.04)
    mesh(taperedTube([hip, V(side * 0.2, 0.84, 0.04), knee], [0.15, 0.19, 0.17, 0.11, 0.075]), SKIN, parent)
    mesh(ball(0.075), SKIN, parent, knee)
    mesh(taperedTube([knee, V(side * 0.22, 0.38, 0.04), ankle], [0.07, 0.055, 0.045]), SKIN, parent)
    mesh(ball(0.05), SKIN, parent, ankle)
    for (const toe of [-1, 0, 1]) {
        const tip = V(side * 0.21 + toe * 0.05, 0.03, 0.12 + (toe === 0 ? 0.03 : 0))
        mesh(taperedTube([ankle, V((ankle.x + tip.x) / 2, 0.06, 0.05), tip], [0.045, 0.032, 0.026]), SKIN, parent)
        mesh(ball(0.03, 1, 0.8, 1.2), SKIN, parent, tip)
    }
}

const TAIL_REST = [V(0, 0.98, -0.16), V(0, 0.72, -0.42), V(0, 0.42, -0.78), V(0.08, 0.3, -1.18), V(0.22, 0.38, -1.52), V(0.32, 0.82, -1.62)]
const TAIL_RADII = [0.16, 0.15, 0.12, 0.1, 0.08, 0.065]

export function createMewtwo() {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)

    for (const side of [-1, 1]) createLeg(side, body)

    // Ventre violet (bassin et abdomen), puis torse pâle aux épaules larges et à la taille fine.
    mesh(lathe([[0, 0.9], [0.14, 0.93], [0.2, 1.0], [0.2, 1.12], [0.17, 1.24], [0.15, 1.34], [0, 1.36]], 1.05, 0.92), PURPLE, body)
    mesh(lathe([[0, 1.24], [0.15, 1.26], [0.16, 1.38], [0.19, 1.5], [0.22, 1.6], [0.19, 1.68], [0.12, 1.73], [0, 1.76]], 1.35, 0.78), SKIN, body)
    // Arête osseuse des épaules et clavicules.
    for (const side of [-1, 1]) {
        mesh(taperedTube([V(side * 0.04, 1.71, 0.07), V(side * 0.16, 1.7, 0.06), V(side * 0.28, 1.67, 0)], [0.035, 0.04, 0.05]), SKIN, body)
    }

    const arms = [createArm(-1), createArm(1)]
    arms.forEach((arm) => body.add(arm))

    // Cou fin et tête féline : crâne rond, museau court, yeux violets, deux cornes courtes vers l'arrière.
    mesh(taperedTube([V(0, 1.7, -0.01), V(0, 1.79, 0.0), V(0, 1.88, 0.03)], [0.07, 0.055, 0.055]), SKIN, body)
    const head = new THREE.Group()
    head.position.set(0, 1.95, 0.03)
    mesh(ball(0.135, 1, 0.95, 1.1), SKIN, head)
    mesh(ball(0.062, 1, 0.72, 1.15), SKIN, head, V(0, -0.045, 0.105))
    for (const side of [-1, 1]) {
        const eye = mesh(ball(0.03, 1.5, 0.75, 0.6), EYE, head, V(side * 0.06, 0.005, 0.115))
        eye.rotation.z = side * -0.3
        mesh(ball(0.012, 1, 1.2, 0.6), PUPIL, head, V(side * 0.064, 0.005, 0.129))
        // Arcade sourcilière : un regard dur plutôt qu'une bouille de peluche.
        const brow = mesh(ball(0.04, 1.4, 0.4, 0.7), SKIN, head, V(side * 0.058, 0.04, 0.105))
        brow.rotation.z = side * 0.35
        mesh(taperedTube([V(side * 0.07, 0.09, -0.01), V(side * 0.1, 0.16, -0.07), V(side * 0.13, 0.2, -0.16)], [0.045, 0.032, 0.016]), SKIN, head)
        mesh(ball(0.017), SKIN, head, V(side * 0.13, 0.2, -0.16))
    }
    body.add(head)
    // Tube qui relie l'arrière du crâne au haut du dos.
    mesh(taperedTube([V(0, 1.96, -0.1), V(0, 1.98, -0.21), V(0, 1.87, -0.26), V(0, 1.74, -0.17)], [0.032, 0.034, 0.034, 0.03]), SKIN, body)

    // Queue : un seul tube effilé, recalculé à chaque image pour onduler.
    const tailPoints = TAIL_REST.map((point) => point.clone())
    const tailGeometry = taperedTube(tailPoints, TAIL_RADII)
    mesh(tailGeometry, PURPLE, body)
    const tailTip = mesh(ball(0.065), PURPLE, body)

    // Aura psychique et pierres arrachées au sol qui gravitent autour de lui.
    const aura = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 24).scale(1, 1.35, 1), auraMaterial())
    aura.position.y = 1.15
    root.add(aura)
    const stoneMaterial = new THREE.MeshStandardMaterial({color: 0x6f6a72, roughness: 0.95})
    const stones = Array.from({length: 7}, (_, index) => mesh(new THREE.DodecahedronGeometry(0.08 + (index % 3) * 0.04, 0), stoneMaterial, root))
    const glow = new THREE.Object3D()
    glow.position.y = 1.3
    glow.userData.light = {intensity: 6, color: 0xa760ff}
    root.add(glow)

    return {
        root,
        update(time: number) {
            // Lévitation : il flotte au-dessus du sol, les bras légèrement écartés.
            body.position.y = 0.25 + Math.sin(time * 1.6) * 0.07
            arms.forEach((arm, index) => {
                const side = index ? 1 : -1
                arm.rotation.z = side * (0.12 + Math.sin(time * 1.6 + index) * 0.05)
                arm.rotation.x = -0.1 + Math.sin(time * 1.1 + index) * 0.05
            })
            head.rotation.y = Math.sin(time * 0.5) * 0.25
            TAIL_REST.forEach((rest, index) => {
                const t = index / (TAIL_REST.length - 1)
                tailPoints[index].set(rest.x + Math.sin(time * 1.8 - t * 3.5) * 0.22 * t, rest.y + Math.sin(time * 1.3 - t * 2) * 0.06 * t, rest.z)
            })
            fillTube(tailGeometry, tailPoints, TAIL_RADII)
            tailTip.position.copy(tailPoints[tailPoints.length - 1])
            ;(aura.material as THREE.ShaderMaterial).uniforms.time.value = time
            stones.forEach((stone, index) => {
                const angle = time * (0.6 + index * 0.05) + index * 0.9
                stone.position.set(Math.cos(angle) * (1.2 + index * 0.08), 0.6 + index * 0.25 + Math.sin(time * 1.3 + index) * 0.1, Math.sin(angle) * (1.2 + index * 0.08))
                stone.rotation.set(time * 0.7 + index, time * 0.5, 0)
            })
        },
    }
}
