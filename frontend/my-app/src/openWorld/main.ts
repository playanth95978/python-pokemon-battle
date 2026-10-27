/** Monde ouvert procédural de 10 000 × 10 000 cases, chargé en streaming autour du joueur. */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Direction } from '../world/types'
import { waterNormals } from '../world3d/buildWorld3D'
import { createAtmosphere, createResolutionScaler, createTrainer } from '../world3d/scenery'
import { TerrainStreamer, VIEW_RADIUS } from './terrainStreamer'
import { TERRAIN_CHUNK } from './terrainGeometry'
import { BIOME_NAMES, createWorldGenerator, SEA_LEVEL, WORLD_SIZE } from './worldGenerator'
import '../world3d/world3d.css'

const WALK_STEP = 170, RUN_STEP = 85, FLY_STEP = 60, FLY_DISTANCE = 4
const KEYS: Record<string, Direction> = {
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
    z: 'up', w: 'up', s: 'down', q: 'left', a: 'left', d: 'right',
}
const DELTAS: Record<Direction, { x: number; y: number }> = {up: {x: 0, y: -1}, down: {x: 0, y: 1}, left: {x: -1, y: 0}, right: {x: 1, y: 0}}
const ANGLES: Record<Direction, number> = {down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2}
const CAMERA_OFFSET = new THREE.Vector3(0, 4.2, 7), FLY_CAMERA_OFFSET = new THREE.Vector3(0, 26, 34)
const VIEW_DISTANCE = VIEW_RADIUS * TERRAIN_CHUNK

const seed = Number(new URLSearchParams(location.search).get('graine')) || 42
const world = createWorldGenerator(seed)

const host = document.getElementById('world3d')!
const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'})
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.72
host.appendChild(renderer.domElement)
const resolution = createResolutionScaler(renderer)

const scene = new THREE.Scene()
// Brouillard linéaire calé sur le rayon chargé : le bord du terrain n'est jamais visible.
scene.fog = new THREE.Fog(0xa9c4d4, VIEW_DISTANCE * 0.35, VIEW_DISTANCE * 0.95)
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000)
const {sun, sunDirection} = createAtmosphere(renderer, scene, 30)
sun.shadow.camera.far = 300

const terrainMaterial = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.95, envMapIntensity: 0.4})
const terrain = new TerrainStreamer(scene, terrainMaterial, seed)

// La mer est un seul plan qui suit le joueur ; les rivières sont creusées sous son niveau.
const normals = waterNormals()
// Une répétition de texture toutes les 6 unités, compensée quand le plan se déplace.
normals.repeat.setScalar(VIEW_DISTANCE * 2.2 / 6)
const sea = new THREE.Mesh(new THREE.PlaneGeometry(VIEW_DISTANCE * 2.2, VIEW_DISTANCE * 2.2), new THREE.MeshPhysicalMaterial({
    color: 0x14506a, roughness: 0.12, transparent: true, opacity: 0.9, normalMap: normals,
    normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 0.45,
}))
sea.rotation.x = -Math.PI / 2
sea.receiveShadow = true
scene.add(sea)

const trainer = createTrainer()
scene.add(trainer)
let pikachu: { root: THREE.Group; mixer: THREE.AnimationMixer } | null = null
void new GLTFLoader().loadAsync('/models/poc/pikachu.glb').then((gltf) => {
    const root = new THREE.Group()
    gltf.scene.scale.setScalar(0.32)
    gltf.scene.traverse((object) => { object.castShadow = true })
    root.add(gltf.scene)
    scene.add(root)
    const mixer = new THREE.AnimationMixer(gltf.scene)
    const idle = gltf.animations.find((clip) => clip.name === 'Idle')
    if (idle) mixer.clipAction(idle).play()
    pikachu = {root, mixer}
}).catch(() => undefined)

/** Position 3D du centre d'une case, posée sur le relief (ou sur l'eau en survol). */
function groundAt(tile: { x: number; y: number }) {
    return new THREE.Vector3(tile.x + 0.5, Math.max(SEA_LEVEL, world.height(tile.x + 0.5, tile.y + 0.5)), tile.y + 0.5)
}

let tile = world.findSpawn()
let direction: Direction = 'down'
let held: Direction | null = null
let running = false, flying = false, zoom = 1
let stepStart = 0, stepDuration = WALK_STEP
let from = groundAt(tile), to = from.clone(), followerFrom = from.clone(), followerTo = from.clone()

function step(now: number) {
    if (!held || now - stepStart < stepDuration) return
    direction = held
    const delta = DELTAS[held], distance = flying ? FLY_DISTANCE : 1
    const next = {x: tile.x + delta.x * distance, y: tile.y + delta.y * distance}
    const inside = next.x >= 0 && next.y >= 0 && next.x < WORLD_SIZE && next.y < WORLD_SIZE
    // En survol on ignore le relief et l'eau, pas les bords du monde.
    if (!inside || (!flying && !world.canWalk(tile, next))) return
    followerFrom = followerTo.clone()
    followerTo = groundAt(tile)
    tile = next
    from = to.clone()
    to = groundAt(tile)
    stepStart = now
    stepDuration = flying ? FLY_STEP : running ? RUN_STEP : WALK_STEP
}

addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase()
    if (key === 'shift') running = true
    if (key === 'f' && !event.repeat) {
        flying = !flying
        // Retour au sol : uniquement sur une case où l'on peut se tenir.
        if (!flying && world.height(tile.x + 0.5, tile.y + 0.5) < SEA_LEVEL) flying = true
    }
    const next = KEYS[key]
    if (!next) return
    event.preventDefault()
    held = next
})
addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase()
    if (key === 'shift') running = false
    if (KEYS[key] === held) held = null
})
addEventListener('blur', () => { held = null; running = false })
addEventListener('wheel', (event) => { zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.001, 0.45, 2.5) }, {passive: true})
addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
})

const hud = document.createElement('div')
hud.className = 'world3d-hud'
document.body.appendChild(hud)
let lastHud = '', fps = 60

function updateHud() {
    const here = world.sample(tile.x + 0.5, tile.y + 0.5)
    const {loaded, pending, workers} = terrain.stats()
    const text = `<strong>${BIOME_NAMES[here.biome]}</strong>`
        + `<p>Case ${tile.x}, ${tile.y} · altitude ${Math.round(here.height)} m · graine ${seed}</p>`
        + `<p>${loaded} chunks affichés${pending ? ` · ${pending} en calcul (${workers} workers)` : ''} · ${Math.round(fps)} i/s · résolution ×${resolution.ratio().toFixed(2)}</p>`
        + `<p class="world3d-help">ZQSD / flèches · Maj pour courir · F ${flying ? 'pour atterrir' : 'pour survoler'} · molette pour zoomer · `
        + '<a href="/world3d.html">Clairbois 3D</a> · <a href="/">carte 2D</a></p>'
    if (text === lastHud) return
    lastHud = text
    hud.innerHTML = text
}

const clock = new THREE.Clock()
const cameraGoal = new THREE.Vector3(), look = from.clone(), lookGoal = new THREE.Vector3(), offset = new THREE.Vector3()
camera.position.copy(from).add(CAMERA_OFFSET)
let hudTimer = 0

renderer.setAnimationLoop((now) => {
    const frameSeconds = clock.getDelta()
    const delta = Math.min(frameSeconds, 0.05)
    fps = fps * 0.95 + (1 / Math.max(frameSeconds, 0.001)) * 0.05
    step(now)
    terrain.update(tile)
    const progress = Math.min(1, (now - stepStart) / stepDuration)

    trainer.position.lerpVectors(from, to, progress)
    if (flying) trainer.position.y += 6 + Math.sin(now * 0.003) * 0.3
    else if (progress < 1) trainer.position.y += Math.abs(Math.sin(progress * Math.PI)) * 0.06
    trainer.rotation.y = THREE.MathUtils.lerp(trainer.rotation.y, ANGLES[direction], 0.25)
    if (pikachu) {
        pikachu.root.visible = !flying
        pikachu.root.position.lerpVectors(followerFrom, followerTo, progress)
        const dx = followerTo.x - followerFrom.x, dz = followerTo.z - followerFrom.z
        if (dx * dx + dz * dz > 0.01) pikachu.root.rotation.y = Math.atan2(dx, dz)
        pikachu.mixer.update(delta)
    }

    // La mer suit le joueur par pas de 32 cases : sa texture ne glisse pas sous les pieds.
    sea.position.set(Math.round(trainer.position.x / 32) * 32, SEA_LEVEL - 0.15, Math.round(trainer.position.z / 32) * 32)
    normals.offset.set(now * 0.000012 + sea.position.x / 6, now * 0.000007 - sea.position.z / 6)

    offset.copy(flying ? FLY_CAMERA_OFFSET : CAMERA_OFFSET).multiplyScalar(zoom)
    cameraGoal.copy(trainer.position).add(offset)
    // La caméra ne passe jamais sous le relief.
    cameraGoal.y = Math.max(cameraGoal.y, world.height(cameraGoal.x, cameraGoal.z) + 1.5)
    camera.position.lerp(cameraGoal, 1 - Math.exp(-delta * 5))
    lookGoal.copy(trainer.position).setY(trainer.position.y + 0.9)
    look.lerp(lookGoal, 1 - Math.exp(-delta * 8))
    camera.lookAt(look)
    sun.target.position.copy(trainer.position)
    sun.position.copy(trainer.position).addScaledVector(sunDirection, 120)

    if ((hudTimer -= delta) <= 0) {
        hudTimer = 0.25
        updateHud()
    }
    renderer.render(scene, camera)
    resolution.update(now, frameSeconds)
})
Object.assign(window, {openWorldDebug: {scene, camera, renderer, terrain, trainer}})
