/** Monde ouvert procédural de 10 000 × 10 000 cases, chargé en streaming autour du joueur. */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Direction } from '../world/types'
import { createWater } from '../world3d/water'
import type { LeviathanFrame } from './leviathan'
import { createLeviathan } from './leviathan'
import { createEncounterOverlay } from '../world3d/encounterOverlay'
import { playBattleTransition } from '../world3d/battleTransition'
import { createAtmosphere, createResolutionScaler, createTrainer, followShadow } from '../world3d/scenery'
import { createFirstPersonView } from '../world3d/firstPerson'
import type { CameraFraming } from '../world3d/cameraRig'
import { createCameraRig } from '../world3d/cameraRig'
import { createPostProcessing } from '../world3d/postProcessing'
import { blocksMovement, plantAt } from './vegetation'
import { createWorldLayers, VIEW_RADIUS } from './worldLayers'
import { TERRAIN_CHUNK } from './terrainGeometry'
import { BIOME_NAMES, createWorldGenerator, SEA_LEVEL, WORLD_SIZE } from './worldGenerator'
import { createMinimap } from './minimap'
import '../world3d/world3d.css'

const WALK_STEP = 170, RUN_STEP = 85, FLY_STEP = 60, FLY_DISTANCE = 4
const KEYS: Record<string, Direction> = {
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
    z: 'up', w: 'up', s: 'down', q: 'left', a: 'left', d: 'right',
}
const DELTAS: Record<Direction, { x: number; y: number }> = {
    up: {x: 0, y: -1},
    down: {x: 0, y: 1},
    left: {x: -1, y: 0},
    right: {x: 1, y: 0}
}
const ANGLES: Record<Direction, number> = {down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2}
const CAMERA_OFFSET = new THREE.Vector3(0, 4.2, 7), FLY_CAMERA_OFFSET = new THREE.Vector3(0, 12, 26)
const VIEW_DISTANCE = VIEW_RADIUS * TERRAIN_CHUNK
/** La mer dépasse largement le brouillard : sous l'horizon, le ciel physique est noir. */
const SEA_SIZE = 8000
const LEVIATHAN_HOME = {x: 5258, z: 5839}
/** Espèce du catalogue du backend jouée par le Léviathan en combat (Léviator). */
const LEVIATHAN_SPECIES = 'gyarados'

const seed = Number(new URLSearchParams(location.search).get('graine')) || 42
const world = createWorldGenerator(seed)

const host = document.getElementById('world3d')!
// Pas de MSAA sur l'écran : l'image passe par le post-traitement, dont le FXAA lisse les bords.
const renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'high-performance'})
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.72
host.appendChild(renderer.domElement)

const scene = new THREE.Scene()
// Brouillard linéaire calé sur le rayon chargé : le bord du terrain n'est jamais visible.
scene.fog = new THREE.Fog(0xa9c4d4, VIEW_DISTANCE * 0.35, VIEW_DISTANCE * 0.95)
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000)
const {sun, sunDirection} = createAtmosphere(renderer, scene, 30)
sun.shadow.camera.far = 300
const firstPerson = createFirstPersonView(renderer.domElement, camera)
const rig = createCameraRig(camera, renderer.domElement, firstPerson)
const post = createPostProcessing(renderer, scene, camera)
const resolution = createResolutionScaler(renderer, undefined, undefined, (ratio) => {
    renderer.setPixelRatio(ratio)
    post.setPixelRatio(ratio)
})

const layers = createWorldLayers(scene, renderer, seed)

// La mer est un seul plan qui suit le joueur ; les rivières sont creusées sous son niveau.
scene.background = new THREE.Color(0xa9c4d4)
// Sommets resserrés autour du joueur : les vagues sont fines de près, le large ne coûte presque rien.
const water = createWater(renderer, scene, sunDirection, {
    width: SEA_SIZE, depth: SEA_SIZE, segments: 256, focused: true,
    waveHeight: 0.14, wavelength: 14, shallowColor: 0xc4e4e0, deepColor: 0x0a2a3a, absorption: 0.45, foamWidth: 0.35,
})
const sea = water.mesh

const trainer = createTrainer()
scene.add(trainer)
// Le Léviathan hante la rivière au sud du départ (graine 42 : ?x=5254&y=5839) ; sans eau profonde à cet endroit, il n'existe pas.
const leviathan = createLeviathan(world, scene, LEVIATHAN_HOME)
let beast: LeviathanFrame = {message: null, shake: 0}
// En développement, la scène est exposée pour l'inspecter depuis la console.
if (import.meta.env.DEV) Object.assign(window, {openWorld: {renderer, scene, camera, leviathan}})
let pikachu: { root: THREE.Group; mixer: THREE.AnimationMixer } | null = null
void new GLTFLoader().loadAsync('/models/poc/pikachu.glb').then((gltf) => {
    const root = new THREE.Group()
    gltf.scene.scale.setScalar(0.32)
    gltf.scene.traverse((object) => {
        object.castShadow = true
    })
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

/** Aucun arbre ni rocher sur la case. */
function isFree(tile: { x: number; y: number }) {
    return !blocksMovement(plantAt(world, tile.x, tile.y))
}

/** Départ choisi dans l'URL (?x=…&y=…), sinon une plaine tempérée près du centre. */
function startTile() {
    const params = new URLSearchParams(location.search)
    const x = Number(params.get('x')), y = Number(params.get('y'))
    const inside = params.has('x') && params.has('y') && x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE
    return inside ? {x: Math.floor(x), y: Math.floor(y)} : world.findSpawn(isFree)
}

let tile = startTile()
const minimap = createMinimap(world, {x: tile.x + 0.5, y: tile.y + 0.5})
document.body.appendChild(minimap.element)
const disposeMinimap = (event: PageTransitionEvent) => {
    if (!event.persisted) minimap.dispose()
}
addEventListener('pagehide', disposeMinimap)
if (import.meta.hot) import.meta.hot.dispose(() => {
    minimap.dispose()
    removeEventListener('pagehide', disposeMinimap)
})
let direction: Direction = 'down'
let held: Direction | null = null
let running = false, zoom = 1
// Un départ sur l'eau ou une falaise commence en survol.
let flying = world.height(tile.x + 0.5, tile.y + 0.5) < SEA_LEVEL
let stepStart = 0, stepDuration = WALK_STEP
let from = groundAt(tile), to = from.clone(), followerFrom = from.clone(), followerTo = from.clone()

function step(now: number) {
    if (!held || now - stepStart < stepDuration) return
    // En vue FPS, les touches sont relatives au regard.
    direction = rig.direction(held)
    const delta = DELTAS[direction], distance = flying ? FLY_DISTANCE : 1
    const next = {x: tile.x + delta.x * distance, y: tile.y + delta.y * distance}
    const inside = next.x >= 0 && next.y >= 0 && next.x < WORLD_SIZE && next.y < WORLD_SIZE
    // En survol on ignore le relief et l'eau, pas les bords du monde.
    if (!inside || (!flying && !(world.canWalk(tile, next) && isFree(next)))) return
    followerFrom = followerTo.clone()
    followerTo = groundAt(tile)
    tile = next
    from = to.clone()
    to = groundAt(tile)
    stepStart = now
    stepDuration = flying ? FLY_STEP : running ? RUN_STEP : WALK_STEP
}

addEventListener('keydown', (event) => {
    if (encounterOverlay.isOpen || challenging || event.ctrlKey || event.metaKey || event.altKey) return
    const key = event.key.toLowerCase()
    if (key === 'e' && !event.repeat && !flying && leviathan?.canChallenge(trainer.position)) {
        event.preventDefault()
        challengeLeviathan()
        return
    }
    if (key === 'shift') running = true
    if (key === 'v' && !event.repeat) rig.cycle(direction)
    if (key === 'f' && !event.repeat) {
        flying = !flying
        // Retour au sol : uniquement sur une case où l'on peut se tenir.
        if (!flying && world.height(tile.x + 0.5, tile.y + 0.5) < SEA_LEVEL) flying = true
    }
    const next = KEYS[key]
    if (!next) return
    event.preventDefault()
    // Nouvelle touche : le repère de la vue est figé jusqu'à ce qu'elle soit relâchée.
    if (next !== held) rig.press()
    held = next
})
addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase()
    if (key === 'shift') running = false
    if (KEYS[key] !== held) return
    held = null
    rig.release()
})
addEventListener('blur', () => {
    held = null
    running = false
    rig.release()
})
addEventListener('wheel', (event) => {
    if (encounterOverlay.isOpen) return
    zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.001, 0.45, 2.5)
}, {passive: true})
addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
    post.setSize(innerWidth, innerHeight)
})

const hud = document.createElement('div')
hud.className = 'world3d-hud'
document.body.appendChild(hud)
let lastHud = '', fps = 60

// Combat contre le Léviathan : la scène se fige pendant l'arène et reprend à la fermeture.
const encounterOverlay = createEncounterOverlay({
    background: [host, hud, minimap.element],
    onPause: () => {
        held = null
        running = false
        rig.setActive(false)
        renderer.setAnimationLoop(null)
    },
    onResume: () => {
        held = null
        rig.setActive(true)
        clock.getDelta()
        renderer.setAnimationLoop(frame)
    },
})
let challenging = false

/** E près du Léviathan : il se dresse, la transition manga monte jusqu'au noir, puis l'arène s'ouvre dessous. */
function challengeLeviathan() {
    held = null
    running = false
    challenging = true
    leviathan!.provoke()
    const transition = playBattleTransition('Léviator sauvage !', 'Le Léviathan surgit de la rivière')
    void transition.blackout.then(() => {
        challenging = false
        const {x, z} = leviathan!.state
        encounterOverlay.open({id: 'leviathan-riviere', speciesKey: LEVIATHAN_SPECIES, position: {x: Math.floor(x), y: Math.floor(z)}})
        transition.leave()
    })
}

function updateHud() {
    const here = world.sample(tile.x + 0.5, tile.y + 0.5)
    const {terrain, vegetation, pending, workers} = layers.stats()
    const text = `<strong>${BIOME_NAMES[here.biome]}</strong>`
        + (beast.message ? `<p><b>${beast.message}</b></p>` : '')
        + `<p>Case ${tile.x}, ${tile.y} · altitude ${Math.round(here.height)} m · graine ${seed}</p>`
        + `<p>${terrain} chunks de terrain, ${vegetation} de végétation${pending ? ` · ${pending} en calcul (${workers} workers)` : ''} · ${Math.round(fps)} i/s · résolution ×${resolution.ratio().toFixed(2)}</p>`
        + `<p class="world3d-help">ZQSD / flèches · Maj pour courir · F ${flying ? 'pour atterrir' : 'pour survoler'} · `
        + (rig.mode === 'fps' ? 'souris pour regarder (clic pour la capturer)' : 'glisser pour tourner la caméra · molette pour zoomer')
        + ` · V : ${rig.next} · `
        + '<a href="/world3d.html">Clairbois 3D</a> · <a href="/">carte 2D</a></p>'
    if (text === lastHud) return
    lastHud = text
    hud.innerHTML = text
}

const FRAMING: CameraFraming = {
    offset: new THREE.Vector3(), lookHeight: 0.9, lookAhead: 0,
    // La caméra ne passe jamais sous le relief.
    adjust: (goal) => { goal.y = Math.max(goal.y, world.height(goal.x, goal.z) + 1.5) },
}

/** Cadrage selon le zoom ; en survol, recul plus grand et regard loin devant pour montrer l'horizon. */
function framing() {
    FRAMING.offset.copy(flying ? FLY_CAMERA_OFFSET : CAMERA_OFFSET).multiplyScalar(zoom)
    FRAMING.lookAhead = flying ? 40 : 0
    return FRAMING
}

const clock = new THREE.Clock()
const offset = new THREE.Vector3()
camera.position.copy(from).add(CAMERA_OFFSET)
let hudTimer = 0

function frame(now: number) {
    const frameSeconds = clock.getDelta()
    const delta = Math.min(frameSeconds, 0.05)
    fps = fps * 0.95 + (1 / Math.max(frameSeconds, 0.001)) * 0.05
    step(now)
    layers.update(tile, now / 1000)
    const progress = Math.min(1, (now - stepStart) / stepDuration)

    trainer.position.lerpVectors(from, to, progress)
    if (flying) trainer.position.y += 6 + Math.sin(now * 0.003) * 0.3
    // Petite marge après chaque pas : la marche ne se coupe pas entre deux cases enchaînées.
    const stepping = !flying && now - stepStart < stepDuration + 60
    trainer.animate(delta, stepping ? (stepDuration === RUN_STEP ? 'run' : 'walk') : 'idle')
    trainer.rotation.y = THREE.MathUtils.lerp(trainer.rotation.y, ANGLES[direction], 0.25)
    if (pikachu) {
        pikachu.root.visible = !flying
        pikachu.root.position.lerpVectors(followerFrom, followerTo, progress)
        const dx = followerTo.x - followerFrom.x, dz = followerTo.z - followerFrom.z
        if (dx * dx + dz * dz > 0.01) pikachu.root.rotation.y = Math.atan2(dx, dz)
        pikachu.mixer.update(delta)
    }

    // La mer suit le joueur par pas de 32 cases ; vagues et rides sont calculées en coordonnées du monde, elles ne glissent pas.
    sea.position.set(Math.round(trainer.position.x / 32) * 32, SEA_LEVEL - 0.15, Math.round(trainer.position.z / 32) * 32)

    // En vue FPS le dresseur disparaît : la caméra est sa tête.
    trainer.visible = rig.mode !== 'fps'
    rig.update(delta, trainer.position, direction, held !== null, framing())
    camera.getWorldDirection(offset)
    minimap.update(now, {x: trainer.position.x, y: trainer.position.z}, direction, Math.atan2(-offset.x, -offset.z))
    // La carte d'ombre suit le regard : l'avant de la scène a ses ombres avant qu'on s'en approche.
    followShadow(sun, sunDirection, camera, trainer.position, 18, 120)
    beast = leviathan?.update(delta, now / 1000, trainer.position) ?? beast
    // Secousse pendant les attaques, après le placement de la caméra ; l'amorti la ramène d'elle-même ensuite.
    if (beast.shake) camera.position.add(offset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(beast.shake * 2))

    if ((hudTimer -= delta) <= 0) {
        hudTimer = 0.25
        updateHud()
    }
    water.prepare(camera, now / 1000)
    post.render()
    resolution.update(now, frameSeconds)
}

renderer.setAnimationLoop(frame)
