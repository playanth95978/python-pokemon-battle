/** Ciel, lumière et dresseur communs aux vues 3D (Clairbois et monde ouvert). */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Sky } from 'three/addons/objects/Sky.js'

export function createAtmosphere(renderer: THREE.WebGLRenderer, scene: THREE.Scene, shadowExtent = 16, shadowMapSize = 2048) {
    // Ciel physique en fin d'après-midi ; il sert aussi d'éclairage d'ambiance (reflets PBR). Air très pur et diffusion
    // forte : le bleu profond et saturé des décors de dessin animé plutôt que le voile laiteux d'un vrai ciel d'été.
    const sunDirection = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(215))
    const sky = new Sky()
    sky.scale.setScalar(1000)
    const skyUniforms = sky.material.uniforms
    skyUniforms.turbidity.value = 2
    skyUniforms.rayleigh.value = 2.6
    skyUniforms.mieCoefficient.value = 0.003
    skyUniforms.mieDirectionalG.value = 0.85
    skyUniforms.sunPosition.value.copy(sunDirection)
    scene.add(sky)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const skyScene = new THREE.Scene()
    skyScene.add(sky.clone())
    scene.environment = pmrem.fromScene(skyScene).texture
    scene.environmentIntensity = 0.35

    const hemisphere = new THREE.HemisphereLight(0xcfe6ff, 0x4a6a3a, 1.2)
    scene.add(hemisphere)
    const sun = new THREE.DirectionalLight(0xffe2b8, 3.4)
    sun.castShadow = true
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    sun.shadow.camera.left = sun.shadow.camera.bottom = -shadowExtent
    sun.shadow.camera.right = sun.shadow.camera.top = shadowExtent
    sun.shadow.camera.far = 80
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.03
    scene.add(sun, sun.target)
    return {sun, sunDirection, sky, hemisphere}
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

/**
 * Allure du dresseur ; `fish` : debout, canne en main (la garde de l'épée du modèle) ; `ride` : à vélo, la tête et les
 * mains gardent le repos neutre, le reste est posé par cinématique inverse (voir createRiderPose).
 */
export type Gait = 'idle' | 'walk' | 'run' | 'fish' | 'ride'

const TRAINER_MODEL = '/models/trainer/casual_character.glb'
const TRAINER_HEIGHT = 1.45
/** Boucle par allure, accélérée pour suivre le pas du jeu (une case en 170 ms à la marche, 85 ms en courant). */
const CLIPS: Record<Gait, [string, number]> = {
    idle: ['CharacterArmature|Idle', 1],
    walk: ['CharacterArmature|Walk', 1.8],
    run: ['CharacterArmature|Run', 1.4],
    fish: ['CharacterArmature|Idle_Sword', 0.6],
    ride: ['CharacterArmature|Idle_Neutral', 1],
}

/**
 * Dresseur animé (modèle CC0 « Casual Character » de Quaternius). La silhouette en primitives sert le temps du
 * chargement, ou si le modèle manque ; `animate` choisit la boucle (repos, marche, course) avec un fondu.
 */
export function createTrainer() {
    let animateModel: ((delta: number, gait: Gait) => void) | null = null
    const trainer = Object.assign(new THREE.Group(), {
        animate: (delta: number, gait: Gait) => animateModel?.(delta, gait),
    })
    const placeholder = createPlaceholderTrainer()
    trainer.add(placeholder)
    void new GLTFLoader().loadAsync(TRAINER_MODEL).then((gltf) => {
        const model = gltf.scene
        model.traverse((object) => {
            object.castShadow = true
            // Les maillages animés sortent de leur boîte de repos : on ne les écarte jamais du rendu par erreur.
            object.frustumCulled = false
        })
        // Pose de repos de chaque nœud, avant toute animation : la pose à vélo repart d'elle à chaque image.
        model.traverse((object) => {
            object.userData.rest = {quaternion: object.quaternion.clone(), position: object.position.clone()}
        })
        model.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(model)
        model.scale.setScalar(TRAINER_HEIGHT / (box.max.y - box.min.y))
        trainer.remove(placeholder)
        trainer.add(model)
        const mixer = new THREE.AnimationMixer(model)
        const actions = Object.fromEntries(Object.entries(CLIPS).map(([gait, [name, speed]]) => {
            const clip = gltf.animations.find((animation) => animation.name === name)
            return [gait, clip ? mixer.clipAction(clip).setEffectiveTimeScale(speed) : null]
        })) as Record<Gait, THREE.AnimationAction | null>
        let current: Gait = 'idle'
        actions.idle?.play()
        animateModel = (delta, gait) => {
            if (gait !== current && actions[gait]) {
                actions[gait]!.reset().play()
                actions[current]?.crossFadeTo(actions[gait]!, 0.18, false)
                current = gait
            }
            mixer.update(delta)
        }
    }).catch(() => undefined)
    return trainer
}

// Silhouette faite de primitives (aucun modèle extrait des jeux).
function createPlaceholderTrainer() {
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
export function createResolutionScaler(renderer: THREE.WebGLRenderer, max = Math.min(devicePixelRatio, 2), min = 0.6,
                                       apply = (ratio: number) => renderer.setPixelRatio(ratio)) {
    let pixelRatio = max, frameTime = 16, lastChange = 0, pinned = false
    apply(max)
    return {
        ratio: () => pixelRatio,
        /** Fige la résolution (réglages de développement) ; `null` rend la main au réglage automatique. */
        pin(ratio: number | null) {
            pinned = ratio !== null
            if (ratio !== null && ratio !== pixelRatio) apply(pixelRatio = ratio)
        },
        update(now: number, frameSeconds: number) {
            // Un onglet en arrière-plan est ralenti par le navigateur : ce n'est pas un manque de puissance.
            if (pinned || document.hidden || frameSeconds > 0.25) return
            frameTime = frameTime * 0.95 + frameSeconds * 1000 * 0.05
            if (now - lastChange < 1500) return
            const wanted = frameTime > 24 ? pixelRatio * 0.85 : frameTime < 18 ? pixelRatio * 1.1 : pixelRatio
            const next = THREE.MathUtils.clamp(wanted, min, max)
            if (Math.abs(next - pixelRatio) < 0.05) return
            pixelRatio = next
            lastChange = now
            apply(pixelRatio)
        },
    }
}
