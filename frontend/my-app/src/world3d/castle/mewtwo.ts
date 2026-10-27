/**
 * Mewtwo stylisé, construit en code comme les autres modèles du POC : aucun maillage ni texture extraits des jeux.
 * Il flotte devant le trône, queue ondulante, entouré d'une aura psychique et de pierres en lévitation.
 */
import * as THREE from 'three'

// Teintes soutenues : sous la lumière mauve de la salle du trône, un lavande trop clair vire au blanc.
const SKIN = new THREE.MeshStandardMaterial({color: 0xb8a6cc, roughness: 0.6})
const PURPLE = new THREE.MeshStandardMaterial({color: 0x6e3a9c, roughness: 0.5})
const EYE = new THREE.MeshStandardMaterial({color: 0x2a0a40, emissive: 0x9b3dff, emissiveIntensity: 1.6, roughness: 0.2})

function part(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent?.add(mesh)
    return mesh
}

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
                float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.5);
                float pulse = 0.75 + 0.25 * sin(time * 2.2);
                // Discrète au centre, plus vive sur le pourtour : elle ne délave pas Mewtwo derrière elle.
                gl_FragColor = vec4(vec3(0.45, 0.18, 1.0) * rim * rim * pulse, rim * pulse * 0.6);
            }`,
    })
}

export function createMewtwo() {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)

    // Jambes puissantes, pieds à trois orteils.
    for (const side of [-1, 1]) {
        part(new THREE.CapsuleGeometry(0.17, 0.45, 6, 14), SKIN, side * 0.2, 0.62, 0, body)
        part(new THREE.CapsuleGeometry(0.1, 0.35, 6, 10), SKIN, side * 0.22, 0.28, 0.02, body)
        part(new THREE.SphereGeometry(0.12, 12, 8).scale(1, 0.5, 1.5), SKIN, side * 0.22, 0.05, 0.08, body)
    }
    // Ventre violet, torse et épaules.
    part(new THREE.SphereGeometry(0.33, 22, 18).scale(1, 1.15, 0.9), PURPLE, 0, 0.98, 0, body)
    part(new THREE.CapsuleGeometry(0.26, 0.42, 8, 18).scale(1.15, 1, 0.85), SKIN, 0, 1.42, 0, body)
    for (const side of [-1, 1]) part(new THREE.SphereGeometry(0.14, 14, 10), SKIN, side * 0.34, 1.62, 0, body)

    // Bras fins, mains à trois doigts terminés par des boules.
    const arms: THREE.Group[] = []
    for (const side of [-1, 1]) {
        const arm = new THREE.Group()
        arm.position.set(side * 0.38, 1.6, 0)
        part(new THREE.CapsuleGeometry(0.06, 0.42, 4, 10), SKIN, 0, -0.25, 0, arm)
        part(new THREE.CapsuleGeometry(0.055, 0.36, 4, 10), SKIN, 0, -0.62, 0.08, arm)
        for (const finger of [-1, 0, 1]) {
            part(new THREE.SphereGeometry(0.045, 10, 8), SKIN, finger * 0.05, -0.88, 0.1 + Math.abs(finger) * -0.02, arm)
        }
        arm.rotation.z = side * 0.25
        body.add(arm)
        arms.push(arm)
    }

    // Tête : crâne arrondi, museau, yeux violets, deux cornes vers l'arrière.
    const head = new THREE.Group()
    head.position.set(0, 1.98, 0.02)
    part(new THREE.SphereGeometry(0.2, 22, 18).scale(1, 0.95, 1.05), SKIN, 0, 0, 0, head)
    part(new THREE.SphereGeometry(0.12, 16, 12).scale(1.1, 0.8, 1), SKIN, 0, -0.06, 0.13, head)
    for (const side of [-1, 1]) {
        part(new THREE.SphereGeometry(0.035, 10, 8).scale(1.4, 0.8, 0.6), EYE, side * 0.09, 0.03, 0.17, head)
        const horn = part(new THREE.ConeGeometry(0.06, 0.28, 10), SKIN, side * 0.13, 0.2, -0.05, head)
        horn.rotation.set(-0.6, 0, side * -0.35)
    }
    body.add(head)
    // Tube qui relie l'arrière du crâne au haut du dos.
    const tube = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 2.0, -0.15), new THREE.Vector3(0, 1.96, -0.36), new THREE.Vector3(0, 1.75, -0.3)])
    part(new THREE.TubeGeometry(tube, 16, 0.045, 8), SKIN, 0, 0, 0, body)

    // Queue : chaîne de sphères dont le rayon décroît, animée par une onde.
    const tail = Array.from({length: 16}, (_, index) => {
        const t = index / 15
        return part(new THREE.SphereGeometry(0.15 * (1 - t * 0.55), 14, 10), PURPLE, 0, 0, 0, body)
    })

    // Aura psychique et pierres arrachées au sol qui gravitent autour de lui.
    const aura = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 24).scale(1, 1.35, 1), auraMaterial())
    aura.position.y = 1.15
    root.add(aura)
    const stoneMaterial = new THREE.MeshStandardMaterial({color: 0x6f6a72, roughness: 0.95})
    const stones = Array.from({length: 7}, (_, index) => {
        const stone = part(new THREE.DodecahedronGeometry(0.08 + (index % 3) * 0.04, 0), stoneMaterial)
        root.add(stone)
        return stone
    })
    const glow = new THREE.Object3D()
    glow.position.y = 1.3
    glow.userData.light = {intensity: 6, color: 0xa760ff}
    root.add(glow)

    return {
        root,
        update(time: number) {
            // Lévitation : il flotte au-dessus du sol, les bras légèrement écartés.
            body.position.y = 0.25 + Math.sin(time * 1.6) * 0.07
            arms.forEach((arm, index) => { arm.rotation.z = (index ? 1 : -1) * (0.3 + Math.sin(time * 1.6 + index) * 0.06) })
            head.rotation.y = Math.sin(time * 0.5) * 0.25
            tail.forEach((segment, index) => {
                const t = index / (tail.length - 1)
                const sway = Math.sin(time * 2 - t * 4) * 0.35 * t
                segment.position.set(sway, 0.9 - t * 0.75 + Math.sin(t * Math.PI) * 0.15, -0.25 - t * 1.4)
            })
            ;(aura.material as THREE.ShaderMaterial).uniforms.time.value = time
            stones.forEach((stone, index) => {
                const angle = time * (0.6 + index * 0.05) + index * 0.9
                stone.position.set(Math.cos(angle) * (1.2 + index * 0.08), 0.6 + index * 0.25 + Math.sin(time * 1.3 + index) * 0.1, Math.sin(angle) * (1.2 + index * 0.08))
                stone.rotation.set(time * 0.7 + index, time * 0.5, 0)
            })
        },
    }
}
