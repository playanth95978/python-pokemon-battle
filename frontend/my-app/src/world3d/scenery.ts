/** Ciel, lumière et dresseur communs aux vues 3D (Clairbois et monde ouvert). */
import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'

export function createAtmosphere(renderer: THREE.WebGLRenderer, scene: THREE.Scene, shadowExtent = 16, shadowMapSize = 2048) {
    // Ciel physique en fin d'après-midi ; il sert aussi d'éclairage d'ambiance (reflets PBR).
    const sunDirection = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(215))
    const sky = new Sky()
    sky.scale.setScalar(1000)
    const skyUniforms = sky.material.uniforms
    skyUniforms.turbidity.value = 4
    skyUniforms.rayleigh.value = 1.4
    skyUniforms.mieCoefficient.value = 0.004
    skyUniforms.mieDirectionalG.value = 0.85
    skyUniforms.sunPosition.value.copy(sunDirection)
    scene.add(sky)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const skyScene = new THREE.Scene()
    skyScene.add(sky.clone())
    scene.environment = pmrem.fromScene(skyScene).texture
    scene.environmentIntensity = 0.35

    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a6a3a, 0.6))
    const sun = new THREE.DirectionalLight(0xffe2b8, 3.4)
    sun.castShadow = true
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    sun.shadow.camera.left = sun.shadow.camera.bottom = -shadowExtent
    sun.shadow.camera.right = sun.shadow.camera.top = shadowExtent
    sun.shadow.camera.far = 80
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.03
    scene.add(sun, sun.target)
    return {sun, sunDirection}
}

const forward = new THREE.Vector3(), axisX = new THREE.Vector3(), axisY = new THREE.Vector3(), focus = new THREE.Vector3()

/**
 * Centre la carte d'ombre `ahead` unités devant la caméra : ce qu'on regarde reçoit ses ombres bien avant
 * d'arriver près du joueur. Le centre est aligné sur les texels de la carte, sinon les bords d'ombre scintillent en marchant.
 */
export function followShadow(sun: THREE.DirectionalLight, sunDirection: THREE.Vector3, camera: THREE.Camera, around: THREE.Vector3, ahead: number, height: number) {
    camera.getWorldDirection(forward).setY(0)
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
    focus.copy(around).addScaledVector(forward.normalize(), ahead)
    // Axes de la caméra d'ombre (même construction que lookAt) : on arrondit le centre dans ce repère.
    const shadowCamera = sun.shadow.camera
    const texel = (shadowCamera.right - shadowCamera.left) / sun.shadow.mapSize.x
    axisX.crossVectors(THREE.Object3D.DEFAULT_UP, sunDirection).normalize()
    axisY.crossVectors(sunDirection, axisX)
    const x = Math.round(focus.dot(axisX) / texel) * texel, y = Math.round(focus.dot(axisY) / texel) * texel, z = focus.dot(sunDirection)
    sun.target.position.copy(axisX).multiplyScalar(x).addScaledVector(axisY, y).addScaledVector(sunDirection, z)
    sun.position.copy(sun.target.position).addScaledVector(sunDirection, height)
}

// Dresseur stylisé fait de primitives (aucun modèle extrait des jeux).
export function createTrainer() {
    const trainer = new THREE.Group()
    const parts: [THREE.BufferGeometry, number, [number, number, number]][] = [
        [new THREE.CapsuleGeometry(0.075, 0.32, 4, 8), 0x2c3e66, [-0.1, 0.22, 0]],
        [new THREE.CapsuleGeometry(0.075, 0.32, 4, 8), 0x2c3e66, [0.1, 0.22, 0]],
        [new THREE.CapsuleGeometry(0.2, 0.32, 6, 12), 0xd8433b, [0, 0.72, 0]],
        [new THREE.BoxGeometry(0.3, 0.36, 0.16), 0xe6b33d, [0, 0.76, -0.2]],
        [new THREE.SphereGeometry(0.2, 20, 16), 0xf2c9a0, [0, 1.17, 0]],
        [new THREE.SphereGeometry(0.215, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0xd8433b, [0, 1.21, 0]],
        [new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), 0xf5f5f5, [0, 1.22, 0.14]],
    ]
    for (const [geometry, color, position] of parts) {
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color, roughness: 0.7}))
        mesh.position.set(...position)
        mesh.castShadow = true
        trainer.add(mesh)
    }
    for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({color: 0x1b1b22}))
        eye.position.set(side * 0.07, 1.18, 0.18)
        trainer.add(eye)
    }
    return trainer
}

/** Résolution dynamique : baisse la définition quand les images ralentissent, la remonte quand il y a de la marge. */
export function createResolutionScaler(renderer: THREE.WebGLRenderer, max = Math.min(devicePixelRatio, 2), min = 0.6) {
    let pixelRatio = max, frameTime = 16, lastChange = 0
    renderer.setPixelRatio(max)
    return {
        ratio: () => pixelRatio,
        update(now: number, frameSeconds: number) {
            // Un onglet en arrière-plan est ralenti par le navigateur : ce n'est pas un manque de puissance.
            if (document.hidden || frameSeconds > 0.25) return
            frameTime = frameTime * 0.95 + frameSeconds * 1000 * 0.05
            if (now - lastChange < 1500) return
            const wanted = frameTime > 24 ? pixelRatio * 0.85 : frameTime < 18 ? pixelRatio * 1.1 : pixelRatio
            const next = THREE.MathUtils.clamp(wanted, min, max)
            if (Math.abs(next - pixelRatio) < 0.05) return
            pixelRatio = next
            lastChange = now
            renderer.setPixelRatio(pixelRatio)
        },
    }
}
