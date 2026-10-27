/** POC : Clairbois en 3D, page séparée de la carte 2D. */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Sky } from 'three/addons/objects/Sky.js'
import type { Direction, PlayerState } from '../world/types'
import {
    boatActionAtDock,
    nearbyLandmark,
    nextPosition,
    toggleBoatAtDock,
    WORLD_MAP,
    WORLD_SPAWN,
    zoneAt
} from '../world/worldMap'
import { buildDecorChunk, buildGrassChunk, buildWorldBase, disposeChunk, tileCenter, WATER_LEVEL } from './buildWorld3D'
import { GRASS_RADIUS, GRASS_UNLOAD_RADIUS, LOAD_RADIUS, UNLOAD_RADIUS } from './worldChunks'
import { createWorldMaterials } from './worldMaterials'
import { WorldStreamer } from './worldStreamer'
import './world3d.css'

const STEP_DURATION = 170
/** Temps de construction de chunks accordé par image : le reste du budget de 16 ms va au rendu. */
const STREAM_BUDGET_MS = 4
const MAX_PIXEL_RATIO = Math.min(devicePixelRatio, 2), MIN_PIXEL_RATIO = 0.6
const CAMERA_OFFSET = new THREE.Vector3(0, 4.2, 7), LOOK_OFFSET = new THREE.Vector3(0, 0, -1.5)
const KEYS: Record<string, Direction> = {
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
    z: 'up', w: 'up', s: 'down', q: 'left', a: 'left', d: 'right',
}
const ANGLES: Record<Direction, number> = {down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2}

const host = document.getElementById('world3d')!
const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'})
renderer.setPixelRatio(MAX_PIXEL_RATIO)
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.72
host.appendChild(renderer.domElement)

const scene = new THREE.Scene()
// Le brouillard masque la limite des chunks chargés (LOAD_RADIUS × CHUNK_SIZE ≈ 24 cases).
scene.fog = new THREE.FogExp2(0xa9c4d4, 0.034)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1200)

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
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = sun.shadow.camera.bottom = -16
sun.shadow.camera.right = sun.shadow.camera.top = 16
sun.shadow.camera.far = 80
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.03
scene.add(sun, sun.target)

const materials = createWorldMaterials(WORLD_MAP, renderer)
const base = buildWorldBase(scene, WORLD_MAP, materials)
const streamer = new WorldStreamer(WORLD_MAP, scene, [
    {name: 'decor', loadRadius: LOAD_RADIUS, unloadRadius: UNLOAD_RADIUS, build: (chunk) => buildDecorChunk(WORLD_MAP, chunk, materials), dispose: disposeChunk},
    {name: 'grass', loadRadius: GRASS_RADIUS, unloadRadius: GRASS_UNLOAD_RADIUS, build: (chunk) => buildGrassChunk(WORLD_MAP, chunk, materials), dispose: disposeChunk},
])

// Dresseur stylisé fait de primitives (aucun modèle extrait des jeux).
function createTrainer() {
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

function createBoat() {
    const boat = new THREE.Group()
    const wood = new THREE.MeshStandardMaterial({color: 0x9a6438, roughness: 0.8})
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 0.3, 16, 1, true), wood)
    hull.scale.set(0.8, 1, 1.6)
    hull.material.side = THREE.DoubleSide
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 1.4), wood)
    deck.position.y = -0.05
    boat.add(hull, deck)
    boat.traverse((object) => {
        object.castShadow = true
    })
    return boat
}

const trainer = createTrainer()
const boat = createBoat()
scene.add(trainer, boat)

interface Companion {
    root: THREE.Group;
    mixer: THREE.AnimationMixer
}

const companions: Companion[] = []

async function loadPokemon(path: string, scale: number) {
    const gltf = await new GLTFLoader().loadAsync(path)
    const root = new THREE.Group()
    gltf.scene.scale.setScalar(scale)
    gltf.scene.traverse((object) => {
        object.castShadow = true;
        object.receiveShadow = true
    })
    root.add(gltf.scene)
    scene.add(root)
    const mixer = new THREE.AnimationMixer(gltf.scene)
    const idle = gltf.animations.find((clip) => clip.name === 'Idle')
    if (idle) mixer.clipAction(idle).play()
    const companion = {root, mixer}
    companions.push(companion)
    return companion
}

let player: PlayerState = {
    travelMode: 'walking',
    position: {...WORLD_SPAWN},
    direction: 'down',
    steps: 0,
    visited: [zoneAt(WORLD_SPAWN)]
}
let stepStart = 0
let from = tileCenter(WORLD_SPAWN.x, WORLD_SPAWN.y), to = from.clone()
let followerFrom = from.clone(), followerTo = from.clone()
let held: Direction | null = null
let zoom = 1

let pikachu: Companion | null = null
void loadPokemon('/models/poc/pikachu.glb', 0.32).then((companion) => { pikachu = companion })
void loadPokemon('/models/poc/charmander.glb', 0.38).then(({root}) => {
    root.position.copy(tileCenter(30, 38))
    root.rotation.y = -0.6
})

function step(now: number) {
    if (!held || now - stepStart < STEP_DURATION) return
    const previous = player.position
    const position = nextPosition(WORLD_MAP, previous, held, player.travelMode)
    player = {...player, direction: held, position}
    if (position === previous) return
    // Pikachu suit le dresseur une case derrière, comme dans les jeux de la série.
    followerFrom = followerTo.clone()
    followerTo = tileCenter(previous.x, previous.y)
    from = to.clone()
    to = tileCenter(position.x, position.y)
    stepStart = now
}

addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase()
    if (key === 'e') {
        player = toggleBoatAtDock(WORLD_MAP, player)
        from = to = tileCenter(player.position.x, player.position.y)
        followerFrom = followerTo = to.clone()
        return
    }
    const direction = KEYS[key]
    if (!direction) return
    event.preventDefault()
    held = direction
})
addEventListener('keyup', (event) => {
    if (KEYS[event.key.toLowerCase()] === held) held = null
})
addEventListener('blur', () => {
    held = null
})
addEventListener('wheel', (event) => {
    zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.001, 0.45, 1.8)
}, {passive: true})

const hud = document.createElement('div')
hud.className = 'world3d-hud'
document.body.appendChild(hud)
let lastHud = ''

function updateHud() {
    const loading = Math.round(Math.min(materials.progress(), streamer.progress(player.position)) * 100)
    const landmark = nearbyLandmark(WORLD_MAP, player.position)
    const boatAction = boatActionAtDock(player)
    const text = `${zoneAt(player.position)}|${landmark?.name}|${boatAction}|${loading}`
    if (text === lastHud) return
    lastHud = text
    hud.innerHTML = `<strong>${zoneAt(player.position)}</strong>`
        + (landmark ? `<p><b>${landmark.name}</b> — ${landmark.message}</p>` : '')
        + (loading < 100 ? `<p>Chargement du monde… ${loading} %</p>` : '')
        + (boatAction ? `<p>E : ${boatAction === 'board' ? 'embarquer' : 'débarquer'}</p>` : '')
        + '<p class="world3d-help">Flèches / ZQSD pour marcher · molette pour zoomer · <a href="/">carte 2D</a></p>'
}

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
})

// Résolution dynamique : baisse la définition quand les images ralentissent, la remonte quand il y a de la marge.
let pixelRatio = MAX_PIXEL_RATIO, frameTime = 16, lastResolutionChange = 0

function adaptResolution(now: number, frameSeconds: number) {
    // Un onglet en arrière-plan est ralenti par le navigateur : ce n'est pas un manque de puissance.
    if (document.hidden || frameSeconds > 0.25) return
    frameTime = frameTime * 0.95 + frameSeconds * 1000 * 0.05
    if (now - lastResolutionChange < 1500) return
    const wanted = frameTime > 24 ? pixelRatio * 0.85 : frameTime < 18 ? pixelRatio * 1.1 : pixelRatio
    const next = THREE.MathUtils.clamp(wanted, MIN_PIXEL_RATIO, MAX_PIXEL_RATIO)
    if (Math.abs(next - pixelRatio) < 0.05) return
    pixelRatio = next
    lastResolutionChange = now
    renderer.setPixelRatio(pixelRatio)
}

const clock = new THREE.Clock()
const cameraGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3(), look = from.clone()
camera.position.copy(from).add(new THREE.Vector3(0, 7, 8))

renderer.setAnimationLoop((now) => {
    const frameSeconds = clock.getDelta()
    const delta = Math.min(frameSeconds, 0.05)
    step(now)
    streamer.update(player.position, STREAM_BUDGET_MS)
    const progress = Math.min(1, (now - stepStart) / STEP_DURATION)
    const moving = progress < 1
    const onBoat = player.travelMode === 'boat'

    trainer.position.lerpVectors(from, to, progress)
    trainer.position.y = (onBoat ? WATER_LEVEL + 0.1 : 0) + (moving ? Math.abs(Math.sin(progress * Math.PI)) * 0.06 : 0)
    trainer.rotation.y = THREE.MathUtils.lerp(trainer.rotation.y, ANGLES[player.direction], 0.25)
    boat.visible = onBoat
    boat.position.set(trainer.position.x, WATER_LEVEL + Math.sin(now * 0.002) * 0.03, trainer.position.z)
    boat.rotation.y = trainer.rotation.y

    if (pikachu) {
        const {root} = pikachu
        root.visible = !onBoat
        root.position.lerpVectors(followerFrom, followerTo, progress)
        const dx = followerTo.x - followerFrom.x, dz = followerTo.z - followerFrom.z
        if (dx * dx + dz * dz > 0.01) root.rotation.y = Math.atan2(dx, dz)
    }
    companions.forEach(({mixer}) => mixer.update(delta))
    base.update(now / 1000)

    // Caméra à la troisième personne, amortie.
    cameraGoal.copy(trainer.position).addScaledVector(CAMERA_OFFSET, zoom)
    camera.position.lerp(cameraGoal, 1 - Math.exp(-delta * 5))
    lookGoal.copy(trainer.position).setY(0.9).add(LOOK_OFFSET)
    look.lerp(lookGoal, 1 - Math.exp(-delta * 8))
    camera.lookAt(look)
    // L'ombre portée suit le joueur pour garder une carte d'ombre nette.
    sun.target.position.copy(trainer.position)
    sun.position.copy(trainer.position).addScaledVector(sunDirection, 40)

    updateHud()
    renderer.render(scene, camera)
    adaptResolution(now, frameSeconds)
})
