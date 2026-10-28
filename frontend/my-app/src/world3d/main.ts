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
import { buildDecorChunk, buildGrassChunk, buildWorldBase, disposeChunk, tileCenter, WATER_LEVEL, waterBounds } from './buildWorld3D'
import { createWater } from './water'
import { GRASS_RADIUS, GRASS_UNLOAD_RADIUS, LOAD_RADIUS, UNLOAD_RADIUS } from './worldChunks'
import { createWorldMaterials } from './worldMaterials'
import { leadsToOpenWorld, nearExit, OPEN_WORLD_URL } from './worldExit'
import { createAtmosphere, createResolutionScaler, createTrainer, followShadow } from './scenery'
import { createFirstPersonView } from './firstPerson'
import type { CameraFraming } from './cameraRig'
import { createCameraRig } from './cameraRig'
import { prepareTrees } from './realTrees'
import type { VillageModels } from './villageModels'
import { loadVillageModels } from './villageModels'
import { createPostProcessing } from './postProcessing'
import { WorldStreamer } from './worldStreamer'
import { createEncounterOverlay } from './encounterOverlay'
import './world3d.css'
import { canInteractWithPokemon } from './pokemonInteraction'
import { createCastleMaterials } from './castle/castleMaterials'
import { buildCastleExterior, CASTLE_DOORSTEP, castleBlocks, entersCastle, isCastleGround } from './castle/castleExterior'
import { createCastle } from './castle/castleMode'
import { playBattleTransition } from './battleTransition'
import { loadGame, saveGame } from './saveGame'

const STEP_DURATION = 170
/** Temps de construction de chunks accordé par image : le reste du budget de 16 ms va au rendu. */
const STREAM_BUDGET_MS = 4
const CAMERA_OFFSET = new THREE.Vector3(0, 4.2, 7)
/** Cadrage dehors : caméra en hauteur derrière le dresseur, regard un peu devant lui. */
const OUTDOOR_FRAMING: CameraFraming = {offset: new THREE.Vector3(), lookHeight: 0.9, lookAhead: 1.5}
/** Cadrage dans le château : plus bas et plus près, sous les plafonds, sans traverser les murs. */
const CASTLE_FRAMING: CameraFraming = {offset: new THREE.Vector3(0, 2.4, 3.6), lookHeight: 1.1, lookAhead: 1.2}
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
const rig = createCameraRig(camera, renderer.domElement, firstPerson)
const post = createPostProcessing(renderer, scene, camera)
// En développement, la scène est exposée pour mesurer le coût du rendu depuis la console.
if (import.meta.env.DEV) Object.assign(window, {world3d: {
    renderer, scene, camera, post, water: () => water, castle: () => castle,
    enterCastle: () => enterCastle(performance.now()),
}})

const materials = createWorldMaterials(WORLD_MAP, renderer)
// Les chunks attendent que les arbres et les maisons soient prêts (modèles chargés, textures envoyées, shaders compilés) :
// rien n'apparaît à moitié chargé.
let village: VillageModels | null = null
void Promise.all([prepareTrees(renderer, scene, ['oak', 'aspen', 'pine']), loadVillageModels(renderer)]).then(([, models]) => {
    village = models
})
const base = buildWorldBase(scene, WORLD_MAP, materials)
// Lac et rivière : eau peu profonde, claire au bord et vert sombre au milieu, petites vagues.
const lake = waterBounds(WORLD_MAP)
const water = createWater(renderer, scene, sunDirection, {
    width: lake.width, depth: lake.depth, segments: Math.ceil(Math.max(lake.width, lake.depth) * 4),
    waveHeight: 0.02, wavelength: 2.4, shallowColor: 0xcfe6dc, deepColor: 0x0e3438, absorption: 3.2, foamWidth: 0.1,
})
water.mesh.position.set(lake.x, WATER_LEVEL, lake.z)
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
        build: (chunk) => buildGrassChunk(WORLD_MAP, chunk, materials, isCastleGround),
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

// Château du pré sud-ouest : extérieur dans Clairbois, intérieur dans sa propre scène (trois étages, Mewtwo au sommet).
const castleMaterials = createCastleMaterials(renderer)
const castleOutside = buildCastleExterior(scene, castleMaterials)
const castle = createCastle(renderer, camera, castleMaterials)
/** Exposition plus forte à l'intérieur : la lumière n'y vient que des torches et des fenêtres. */
const CASTLE_EXPOSURE = 1.3, OUTDOOR_EXPOSURE = renderer.toneMappingExposure

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

// Reprise de la partie sauvegardée (position, objets ramassés, portes ouvertes), sinon départ au point d'apparition.
const saved = loadGame(localStorage)
let player: PlayerState = saved?.player ?? {
    travelMode: 'walking',
    position: {...WORLD_SPAWN},
    direction: 'down',
    steps: 0,
    visited: [zoneAt(WORLD_SPAWN)]
}
if (saved) castle.load(saved)
/** Case du château où reprendre ; on y entre une fois Pikachu chargé, pour qu'il suive le dresseur à l'intérieur. */
let resumeInCastle = saved?.castle ?? null
let stepStart = 0
let from = tileCenter(player.position.x, player.position.y), to = from.clone()
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
}).finally(() => {
    if (!resumeInCastle) return
    enterCastle(performance.now(), resumeInCastle)
    resumeInCastle = null
})
void loadPokemon('/models/poc/charmander.glb', 0.38).then(({root}) => {
    root.name = wildCharmander.id
    root.position.copy(tileCenter(wildCharmander.position.x, wildCharmander.position.y))
    root.rotation.y = -0.6
})

function step(now: number) {
    if (encounterOverlay.isOpen || challenging || !held) return
    // Les touches sont relatives à la vue (caméra libre, vue de dos ou regard FPS).
    const direction = rig.direction(held)
    if (castle.active) {
        const event = castle.step(direction, now)?.type
        if (event === 'exit') leaveCastle(now)
        // Après un escalier, la touche encore enfoncée ramènerait aussitôt dans l'escalier : il faut la relâcher.
        if (event === 'stairs') {
            held = null
            rig.release()
        }
        return
    }
    if (now - stepStart < STEP_DURATION) return
    const previous = player.position
    const position = nextPosition(WORLD_MAP, previous, direction, player.travelMode)
    // Le château n'est pas sur la carte 2D : ses murs bloquent, sa grande porte fait entrer.
    if (castleBlocks(position)) {
        player = {...player, direction}
        if (player.travelMode === 'walking' && entersCastle(position, direction)) enterCastle(now)
        return
    }
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

function enterCastle(now: number, resume?: Parameters<typeof castle.enter>[3]) {
    held = null
    boat.visible = false
    castle.enter(trainer, pikachu?.root ?? null, now, resume)
    rig.snap(trainer.position, CASTLE_FRAMING)
    renderer.toneMappingExposure = CASTLE_EXPOSURE
    lastHud = ''
}

/** Retour devant la grande porte, face à l'ouest ; Pikachu suit une case derrière. */
function leaveCastle(now: number) {
    castle.leave()
    renderer.toneMappingExposure = OUTDOOR_EXPOSURE
    held = null
    player = {...player, direction: 'left', position: {...CASTLE_DOORSTEP}}
    from = to = tileCenter(CASTLE_DOORSTEP.x, CASTLE_DOORSTEP.y)
    followerFrom = followerTo = tileCenter(CASTLE_DOORSTEP.x + 1, CASTLE_DOORSTEP.y)
    stepStart = now - STEP_DURATION
    trainer.rotation.y = ANGLES.left
    rig.snap(to, outdoorFraming())
    lastHud = ''
}

let challenging = false

/** E devant Mewtwo : transition manga jusqu'au noir, puis l'arène s'ouvre dessous. */
function challengeMewtwo() {
    held = null
    challenging = true
    const transition = playBattleTransition('Mewtwo !', 'Le Pokémon génétique se dresse devant le trône')
    void transition.blackout.then(() => {
        challenging = false
        encounterOverlay.open({id: 'mewtwo-chateau', speciesKey: castle.boss.speciesKey, position: castle.boss.position})
        transition.leave()
    })
}

addEventListener('keydown', (event) => {
    if (encounterOverlay.isOpen || challenging || event.ctrlKey || event.metaKey || event.altKey) return
    const key = event.key.toLowerCase()
    if (key === 'v' && !event.repeat) {
        rig.cycle(castle.state?.facing ?? player.direction)
        lastHud = ''
        return
    }
    if (key === 'e') {
        if (event.repeat) return

        event.preventDefault()
        held = null
        if (castle.active) {
            if (castle.nearBoss()) challengeMewtwo()
            return
        }
        console.log(player,wildCharmander)
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
    // La répétition automatique d'une touche dont le pas a été interrompu (escalier, combat) ne relance pas la marche.
    if (event.repeat && !held) return
    // Nouvelle touche : le repère de la vue est figé jusqu'à ce qu'elle soit relâchée.
    if (direction !== held) rig.press()
    held = direction
})
addEventListener('keyup', (event) => {
    if (KEYS[event.key.toLowerCase()] !== held) return
    held = null
    rig.release()
})
addEventListener('blur', () => {
    held = null
    rig.release()
})

/** Sauvegarde dans le navigateur : position (dehors ou dans le château), objets ramassés, portes ouvertes. */
function persist() {
    const inside = castle.state
    saveGame(localStorage, {
        player,
        castle: inside ? {floor: inside.floor, x: inside.x, z: inside.z, facing: inside.facing} : resumeInCastle,
        ...castle.bag(),
    })
}
// `pagehide` couvre la fermeture de l'onglet, le rechargement et le départ vers le monde ouvert ; un onglet masqué
// peut être tué sans prévenir (mobile, navigateur fermé), d'où la sauvegarde aussi au passage en arrière-plan.
addEventListener('pagehide', persist)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist()
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
        rig.setActive(false)
        renderer.setAnimationLoop(null)
    },
    onResume: () => {
        held = null
        rig.setActive(true)
        clock.getDelta()
        renderer.setAnimationLoop(animate)
    },
})

function updateHud(now: number) {
    if (castle.active) {
        const text = castle.hud(now, viewHelp())
        if (text === lastHud) return
        lastHud = text
        hud.innerHTML = text
        return
    }
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
        + `<p class="world3d-help">Flèches / ZQSD pour marcher · ${viewHelp()} · <a href="/">carte 2D</a> · <a href="/open-world.html">monde ouvert</a></p>`
}

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
    post.setSize(innerWidth, innerHeight)
    castle.setSize(innerWidth, innerHeight)
})

const resolution = createResolutionScaler(renderer, undefined, undefined, (ratio) => {
    renderer.setPixelRatio(ratio)
    post.setPixelRatio(ratio)
    castle.setPixelRatio(ratio)
})

/** Aide du HUD sur les vues : la vue actuelle et ce que fait V. */
function viewHelp() {
    const look = rig.mode === 'fps' ? 'souris pour regarder (clic pour la capturer)' : 'glisser pour tourner la caméra · molette pour zoomer'
    return `${look} · V : ${rig.next}`
}

/** Le recul dehors suit le zoom de la molette. */
function outdoorFraming() {
    OUTDOOR_FRAMING.offset.copy(CAMERA_OFFSET).multiplyScalar(zoom)
    return OUTDOOR_FRAMING
}

CASTLE_FRAMING.reach = castle.cameraReach

const clock = new THREE.Clock()
camera.position.copy(from).add(new THREE.Vector3(0, 7, 8))

function animate(now: number) {
    const frameSeconds = clock.getDelta()
    const delta = Math.min(frameSeconds, 0.05)
    step(now)
    if (castle.active) {
        // À l'intérieur : seul le château est animé et dessiné ; Clairbois attend dehors.
        castle.update(now, delta)
        companions.forEach(({mixer}) => mixer.update(delta))
        trainer.visible = rig.mode !== 'fps'
        rig.update(delta, trainer.position, castle.state!.facing, held !== null, CASTLE_FRAMING)
        updateHud(now)
        castle.render()
        resolution.update(now, frameSeconds)
        return
    }
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
    trainer.visible = rig.mode !== 'fps'
    rig.update(delta, trainer.position, player.direction, held !== null, outdoorFraming())
    // La carte d'ombre suit le regard : l'avant de la scène a ses ombres avant qu'on s'en approche.
    followShadow(sun, sunDirection, camera, trainer.position, 10, 40)
    castleOutside.update(now / 1000)

    updateHud(now)
    water.prepare(camera, now / 1000)
    post.render()
    resolution.update(now, frameSeconds)
}

renderer.setAnimationLoop(animate)
