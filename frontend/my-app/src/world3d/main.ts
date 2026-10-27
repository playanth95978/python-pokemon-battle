/** POC : Clairbois en 3D, page séparée de la carte 2D. */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Direction, PlayerState } from '../world/types'
import type { WorldPokemon } from './worldPokemon'
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
import { leadsToOpenWorld, nearExit, OPEN_WORLD_URL } from './worldExit'
import { createAtmosphere, createResolutionScaler, createTrainer, followShadow } from './scenery'
import { createFirstPersonView } from './firstPerson'
import { prepareTrees } from './realTrees'
import type { VillageModels } from './villageModels'
import { loadVillageModels } from './villageModels'
import { createPostProcessing } from './postProcessing'
import { WorldStreamer } from './worldStreamer'
import { createEncounterOverlay } from './encounterOverlay'
import './world3d.css'
import { canInteractWithPokemon } from './pokemonInteraction'

const STEP_DURATION = 170
/** Temps de construction de chunks accordé par image : le reste du budget de 16 ms va au rendu. */
const STREAM_BUDGET_MS = 4
const CAMERA_OFFSET = new THREE.Vector3(0, 4.2, 7), LOOK_OFFSET = new THREE.Vector3(0, 0, -1.5)
const KEYS: Record<string, Direction> = {
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
    z: 'up', w: 'up', s: 'down', q: 'left', a: 'left', d: 'right',
}
const ANGLES: Record<Direction, number> = {down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2}

const host = document.getElementById('world3d')!
// Pas de MSAA sur l'écran : l'image passe par le post-traitement, dont le FXAA lisse les bords.
const renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'high-performance'})
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.72
host.appendChild(renderer.domElement)
renderer.domElement.tabIndex = 0
renderer.domElement.setAttribute('aria-label', 'Monde 3D de Clairbois')

const scene = new THREE.Scene()
// Le brouillard masque la limite des chunks chargés (LOAD_RADIUS × CHUNK_SIZE ≈ 24 cases).
scene.fog = new THREE.FogExp2(0xa9c4d4, 0.034)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1200)

// Carte d'ombre plus large et plus fine, centrée devant la caméra (voir followShadow).
const {sun, sunDirection} = createAtmosphere(renderer, scene, 20, 3072)
const firstPerson = createFirstPersonView(renderer.domElement, camera)
const post = createPostProcessing(renderer, scene, camera)
// En développement, la scène est exposée pour mesurer le coût du rendu depuis la console.
if (import.meta.env.DEV) Object.assign(window, {world3d: {renderer, scene, camera, post}})

const materials = createWorldMaterials(WORLD_MAP, renderer)
// Les chunks attendent que les arbres et les maisons soient prêts (modèles chargés, textures envoyées, shaders compilés) :
// rien n'apparaît à moitié chargé.
let village: VillageModels | null = null
void Promise.all([prepareTrees(renderer, scene, ['oak', 'aspen', 'pine']), loadVillageModels(renderer)]).then(([, models]) => {
    village = models
})
const base = buildWorldBase(scene, WORLD_MAP, materials)
const streamer = new WorldStreamer(WORLD_MAP, scene, [
    {
        name: 'decor',
        loadRadius: LOAD_RADIUS,
        unloadRadius: UNLOAD_RADIUS,
        build: (chunk) => buildDecorChunk(WORLD_MAP, chunk, village!),
        dispose: disposeChunk
    },
    {
        name: 'grass',
        loadRadius: GRASS_RADIUS,
        unloadRadius: GRASS_UNLOAD_RADIUS,
        build: (chunk) => buildGrassChunk(WORLD_MAP, chunk, materials),
        dispose: disposeChunk
    },
])

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
const wildCharmander: WorldPokemon = {
    id: 'charmander-prairie-01',
    speciesKey: 'charmander',
    position: {x: 30, y: 38},
}
void loadPokemon('/models/poc/pikachu.glb', 0.32).then((companion) => {
    pikachu = companion
})
void loadPokemon('/models/poc/charmander.glb', 0.38).then(({root}) => {
    root.name = wildCharmander.id
    root.position.copy(tileCenter(wildCharmander.position.x, wildCharmander.position.y))
    root.rotation.y = -0.6
})

function step(now: number) {
    if (encounterOverlay.isOpen || !held || now - stepStart < STEP_DURATION) return
    const previous = player.position
    // En vue FPS, les touches sont relatives au regard.
    const direction = firstPerson.enabled ? firstPerson.direction(held) : held
    const position = nextPosition(WORLD_MAP, previous, direction, player.travelMode)
    player = {...player, direction, position}
    if (position === previous) {
        // Au bout de la route est, pousser vers les arbres fait sortir vers le monde ouvert.
        if (player.travelMode === 'walking' && leadsToOpenWorld(previous, direction)) {
            held = null
            location.assign(OPEN_WORLD_URL)
        }
        return
    }
    // Pikachu suit le dresseur une case derrière, comme dans les jeux de la série.
    followerFrom = followerTo.clone()
    followerTo = tileCenter(previous.x, previous.y)
    from = to.clone()
    to = tileCenter(position.x, position.y)
    stepStart = now
}

addEventListener('keydown', (event) => {
    if (encounterOverlay.isOpen || event.ctrlKey || event.metaKey || event.altKey) return
    const key = event.key.toLowerCase()
    if (key === 'v' && !event.repeat) {
        firstPerson.toggle(player.direction)
        lastHud = ''
        return
    }
    if (key === 'e') {
        if (event.repeat) return

        event.preventDefault()
        held = null

        const nearCharmander =
            player.travelMode === 'walking'
            && canInteractWithPokemon(player.position, wildCharmander)

        if (nearCharmander) {
            encounterOverlay.open(wildCharmander)
            return
        }

        // Conserver ici le code actuel d'embarquement.
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
    if (encounterOverlay.isOpen) return
    zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.001, 0.45, 1.8)
}, {passive: true})

const hud = document.createElement('div')
hud.className = 'world3d-hud'
document.body.appendChild(hud)
let lastHud = ''
const encounterOverlay = createEncounterOverlay({
    background: [host, hud],
    onPause: () => {
        held = null
        firstPerson.setActive(false)
        renderer.setAnimationLoop(null)
    },
    onResume: () => {
        held = null
        firstPerson.setActive(true)
        clock.getDelta()
        renderer.setAnimationLoop(animate)
    },
})

function updateHud() {
    const loading = Math.round(Math.min(materials.progress(), village ? streamer.progress(player.position) : 0) * 100)
    const landmark = nearbyLandmark(WORLD_MAP, player.position)
    const boatAction = boatActionAtDock(player)
    const exit = nearExit(player.position)
    const nearCharmander = player.travelMode === 'walking' && canInteractWithPokemon(player.position, wildCharmander)
    const text = `${zoneAt(player.position)}|${landmark?.name}|${boatAction}|${loading}|${exit}|${nearCharmander}`
    if (text === lastHud) return
    lastHud = text
    hud.innerHTML = `<strong>${zoneAt(player.position)}</strong>`
        + (landmark ? `<p><b>${landmark.name}</b> — ${landmark.message}</p>` : '')
        + (loading < 100 ? `<p>Chargement du monde… ${loading} %</p>` : '')
        + (exit ? '<p><b>Sortie est</b> — continue vers l’est pour rejoindre le monde ouvert.</p>' : '')
        + (nearCharmander ? '<p><b>Salamèche</b> — E : ouvrir le combat</p>' : '')
        + (boatAction ? `<p>E : ${boatAction === 'board' ? 'embarquer' : 'débarquer'}</p>` : '')
        + `<p class="world3d-help">Flèches / ZQSD pour marcher · ${firstPerson.enabled ? 'souris pour regarder (clic pour la capturer) · V : vue de dos' : 'molette pour zoomer · V : vue FPS'} · <a href="/">carte 2D</a> · <a href="/open-world.html">monde ouvert</a></p>`
}

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
    post.setSize(innerWidth, innerHeight)
})

const resolution = createResolutionScaler(renderer, undefined, undefined, (ratio) => {
    renderer.setPixelRatio(ratio)
    post.setPixelRatio(ratio)
})

const clock = new THREE.Clock()
const cameraGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3(), look = from.clone()
camera.position.copy(from).add(new THREE.Vector3(0, 7, 8))

function animate(now: number) {
    const frameSeconds = clock.getDelta()
    const delta = Math.min(frameSeconds, 0.05)
    step(now)
    if (village) streamer.update(player.position, STREAM_BUDGET_MS)
    const progress = Math.min(1, (now - stepStart) / STEP_DURATION)
    const onBoat = player.travelMode === 'boat'

    trainer.position.lerpVectors(from, to, progress)
    trainer.position.y = onBoat ? WATER_LEVEL + 0.1 : 0
    // Petite marge après chaque pas : la marche ne se coupe pas entre deux cases enchaînées.
    trainer.animate(delta, !onBoat && now - stepStart < STEP_DURATION + 60 ? 'walk' : 'idle')
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

    // En vue FPS le dresseur disparaît : la caméra est sa tête.
    trainer.visible = !firstPerson.enabled
    if (firstPerson.enabled) {
        firstPerson.place(trainer.position)
    } else {
        // Caméra à la troisième personne, amortie.
        cameraGoal.copy(trainer.position).addScaledVector(CAMERA_OFFSET, zoom)
        camera.position.lerp(cameraGoal, 1 - Math.exp(-delta * 5))
        lookGoal.copy(trainer.position).setY(0.9).add(LOOK_OFFSET)
        look.lerp(lookGoal, 1 - Math.exp(-delta * 8))
        camera.lookAt(look)
    }
    // La carte d'ombre suit le regard : l'avant de la scène a ses ombres avant qu'on s'en approche.
    followShadow(sun, sunDirection, camera, trainer.position, 10, 40)

    updateHud()
    post.render()
    resolution.update(now, frameSeconds)
}

renderer.setAnimationLoop(animate)
