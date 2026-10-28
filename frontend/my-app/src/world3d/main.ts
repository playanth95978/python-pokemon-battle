/** POC : Clairbois en 3D, page séparée de la carte 2D. */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Direction, PlayerState, Position } from '../world/types'
import type { WorldPokemon } from './worldPokemon'
import {
    boatActionAtDock,
    canEnter,
    nearbyLandmark,
    nextPosition,
    tileAt,
    toggleBoatAtDock,
    WORLD_MAP,
    WORLD_SPAWN,
    zoneAt
} from '../world/worldMap'
import { buildDecorChunk, buildGrassChunk, buildWorldBase, disposeChunk, tileCenter, WATER_LEVEL, waterBounds } from './buildWorld3D'
import { createWater } from './water'
import { CHUNK_SIZE, GRASS_RADIUS, GRASS_UNLOAD_RADIUS, LOAD_RADIUS, UNLOAD_RADIUS } from './worldChunks'
import { createWorldMaterials } from './worldMaterials'
import { leadsToOpenWorld, nearExit, OPEN_WORLD_URL } from './worldExit'
import { createAtmosphere, createResolutionScaler, createTrainer, followShadow } from './scenery'
import { createFirstPersonView } from './firstPerson'
import type { CameraFraming } from './cameraRig'
import { createCameraRig } from './cameraRig'
import { prepareTrees } from './realTrees'
import type { VillageModels } from './villageModels'
import { loadVillageModels } from './villageModels'
import { createVillageProps } from './villageProps'
import { createPostProcessing } from './postProcessing'
import { WorldStreamer } from './worldStreamer'
import { createEncounterOverlay } from './encounterOverlay'
import './world3d.css'
import { canInteractWithPokemon } from './pokemonInteraction'
import { createCastleMaterials } from './castle/castleMaterials'
import { buildCastleExterior, CASTLE_DOORSTEP, castleBlocks, entersCastle, isCastleGround } from './castle/castleExterior'
import { createCastle } from './castle/castleMode'
import { createCastleAudio } from './castle/castleAudio'
import { createCastleMinimap } from './castle/castleMinimap'
import { battleBonus, capturesBoss, describeBonus, ghostEncounter } from './castle/castleQuest'
import type { CastleEvent } from './castle/castleLayout'
import { playBattleTransition } from './battleTransition'
import { clearGame, loadGame, saveGame } from './saveGame'
import { castleBlocks as insideCastleWalls } from './castle/castleArea'
import { createVillagers, talkTo, updateVillagers, VILLAGERS, villagerAt } from './village/villagers'
import { createVillagerView } from './village/villagerView'
import { createVillagePokemon, pokemonAt, pokemonNear, updateVillagePokemon, VILLAGE_POKEMON } from './village/villagePokemon'
import { createVillagePokemonView } from './village/villagePokemonView'
import { advanceHour, formatHour, START_HOUR } from './village/villageClock'
import { applyDaylight, daylight } from './village/dayCycle'
import { lanternGlass } from './villageProps'

const STEP_DURATION = 170
/** Temps de construction de chunks accordé par image : le reste du budget de 16 ms va au rendu. */
const STREAM_BUDGET_MS = 4
const CAMERA_OFFSET = new THREE.Vector3(0, 4.2, 7)
/** Cadrage dehors : caméra en hauteur derrière le dresseur, regard un peu devant lui. */
const OUTDOOR_FRAMING: CameraFraming = {offset: new THREE.Vector3(), lookHeight: 0.9, lookAhead: 1.5}
/** Cadrage dans le château : plus bas et plus près, sous les plafonds, sans traverser les murs. */
const CASTLE_FRAMING: CameraFraming = {offset: new THREE.Vector3(0, 2.4, 3.6), lookHeight: 1.1, lookAhead: 1.2}
/** Direction monde de chaque touche, pour la marche libre du château (x vers l'est, z vers le sud). */
const VECTORS: Record<Direction, [number, number]> = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]}
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
const {sun, sunDirection, sky, hemisphere} = createAtmosphere(renderer, scene, 20, 3072)
const firstPerson = createFirstPersonView(renderer.domElement, camera)
const rig = createCameraRig(camera, renderer.domElement, firstPerson)
const post = createPostProcessing(renderer, scene, camera)
// En développement, la scène est exposée pour mesurer le coût du rendu depuis la console.
if (import.meta.env.DEV) Object.assign(window, {world3d: {
    renderer, scene, camera, post, water: () => water, castle: () => castle, villagers: () => villagers,
    setHour: (value: number) => { hour = value },
    teleport: (x: number, y: number) => {
        player = {...player, position: {x, y}}
        from = to = tileCenter(x, y)
    },
    enterCastle: () => enterCastle(performance.now()),
}})

const materials = createWorldMaterials(WORLD_MAP, renderer)
// Les chunks attendent que les arbres et les maisons soient prêts (modèles chargés, textures envoyées, shaders compilés) :
// rien n'apparaît à moitié chargé.
let village: VillageModels | null = null
void Promise.all([prepareTrees(renderer, scene, ['oak', 'aspen', 'pine']), loadVillageModels(renderer)]).then(([, models]) => {
    village = models
})
const villageProps = createVillageProps(materials)
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
        build: (chunk) => buildDecorChunk(WORLD_MAP, chunk, village!, villageProps),
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
const castleAudio = createCastleAudio()
const minimap = createCastleMinimap(document.body)
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
/** Pokémon capturés en exploration (Mewtwo, avec la Master Ball). */
let captured: string[] = saved?.captured ?? []
/** Nouvelle partie demandée : la page se recharge sans réécrire la sauvegarde effacée. */
let discarded = false
let stepStart = 0
let from = tileCenter(player.position.x, player.position.y), to = from.clone()
let followerFrom = from.clone(), followerTo = from.clone()
let held: Direction | null = null
/** Toutes les directions enfoncées : dans le château, elles se combinent (diagonales). */
const pressed = new Set<Direction>()
let zoom = 1
/** Pas faits dans le château depuis le dernier spectre (ou l'entrée). */
let stepsSinceGhost = 0

// Habitants de Clairbois : leur journée suit l'horloge du village (douze minutes pour vingt-quatre heures).
let hour = START_HOUR
const villagers = createVillagers(VILLAGERS, hour)
const villagerView = createVillagerView(scene, villagers)
// Pokémon du village : au travail, au pré, sur les lanternes, dans le lac… et deux sauvages (Évoli, Fantominus la nuit).
const villagePokemon = createVillagePokemon(VILLAGE_POKEMON, Math.random)
const villagePokemonView = createVillagePokemonView(scene, villagePokemon)
/** Cases à moins de `reach` cases d'une eau. */
function aroundWater(reach: number) {
    const near = new Set<string>()
    for (let y = 0; y < WORLD_MAP.height; y++) for (let x = 0; x < WORLD_MAP.width; x++) {
        if (tileAt(WORLD_MAP, {x, y}) !== 'water') continue
        for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) near.add(`${x + dx},${y + dy}`)
    }
    return near
}
/** Près d'une rive, on peut se voir à travers l'eau ; à moins d'un chunk, son reflet reste visible (arbres de l'autre rive). */
const SHORE = aroundWater(4), MIRRORED = aroundWater(CHUNK_SIZE + 2)
const tileKey = (x: number, z: number) => `${Math.floor(x)},${Math.floor(z)}`
const chunkReach = new WeakMap<THREE.Object3D, { shore: boolean; mirrored: boolean }>()

/** Ce que les passes de l'eau peuvent ignorer : objets ni vus à travers l'eau (`refraction`) ni reflétés (`reflection`). */
function dryObjects() {
    const actors = [...villagerView.roots(), ...villagePokemonView.roots()].filter((root) => !SHORE.has(tileKey(root.position.x, root.position.z)))
    const chunks = scene.children.filter((object) => object.name.startsWith('decor') || object.name.startsWith('grass'))
    const reach = (chunk: THREE.Object3D) => {
        if (!chunkReach.has(chunk)) {
            const [cx, cy] = chunk.name.split(' ')[1].split(',').map(Number)
            const tiles = Array.from({length: CHUNK_SIZE * CHUNK_SIZE}, (_, index) => tileKey(cx * CHUNK_SIZE + index % CHUNK_SIZE, cy * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE)))
            chunkReach.set(chunk, {shore: tiles.some((tile) => SHORE.has(tile)), mirrored: tiles.some((tile) => MIRRORED.has(tile))})
        }
        return chunkReach.get(chunk)!
    }
    return {
        reflection: [...actors, ...chunks.filter((chunk) => !reach(chunk).mirrored || chunk.name.startsWith('grass'))],
        refraction: [...actors, ...chunks.filter((chunk) => !reach(chunk).shore)],
    }
}
const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4()
const walkable = (tile: Position) => canEnter(tileAt(WORLD_MAP, tile), 'walking') && !insideCastleWalls(tile)
/** Répliques déjà entendues, par habitant : la conversation avance à chaque visite. */
const said = new Map<string, number>()
let dialogue: { name: string; job: string; text: string; until: number } | null = null
const DAY = {scene, sun, sunDirection, sky, hemisphere, lanterns: lanternGlass}

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
    // Dans le château, la marche est continue : voir walkInCastle, appelée à chaque image.
    if (castle.active) return
    if (now - stepStart < STEP_DURATION) return
    const previous = player.position
    const position = nextPosition(WORLD_MAP, previous, direction, player.travelMode)
    // Le château n'est pas sur la carte 2D : ses murs bloquent, sa grande porte fait entrer.
    // Un habitant sur la case : le dresseur se tourne vers lui sans avancer.
    if (player.travelMode === 'walking' && (villagerAt(villagers, position) || pokemonAt(villagePokemon, position))) {
        player = {...player, direction}
        return
    }
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

/** Plus aucune touche active : il faudra relâcher puis réappuyer pour repartir. */
function stopWalking() {
    held = null
    pressed.clear()
    rig.release()
}

/** Marche libre dans le château : les touches enfoncées, relatives à la vue, donnent une direction monde. */
function walkInCastle(delta: number, now: number) {
    if (encounterOverlay.isOpen || challenging) return
    let dx = 0, dz = 0
    for (const key of pressed) {
        const [x, z] = VECTORS[rig.direction(key)]
        dx += x
        dz += z
    }
    const length = Math.hypot(dx, dz)
    for (const event of castle.move(length ? dx / length : 0, length ? dz / length : 0, delta, now)) {
        castleAudio.play(event, castle.state!)
        if (event.type === 'exit') return leaveCastle(now)
        // Après un escalier, la touche encore enfoncée ramènerait aussitôt dans l'escalier : il faut la relâcher.
        if (event.type === 'stairs') stopWalking()
        if (event.type === 'moved' || event.type === 'pickup') haunt(++stepsSinceGhost)
    }
}

/** À chaque case franchie, un spectre peut surgir (jamais au sommet, où Mewtwo règne seul). */
function haunt(steps: number) {
    const species = ghostEncounter(castle.state!, steps, Math.random(), Math.random())
    if (!species) return
    stepsSinceGhost = 0
    startCastleBattle(species, 'Un spectre surgit !', 'Une silhouette glacée traverse le mur', `spectre-${species}-${Date.now()}`)
}

/** Transition manga jusqu'au noir, puis l'arène s'ouvre dessous ; les objets du sac renforcent le dresseur. */
function startCastleBattle(speciesKey: string, title: string, subtitle: string, id: string,
                           victory?: { onVictory: () => void; victoryText: string }) {
    stopWalking()
    challenging = true
    castleAudio.challenge()
    const bonus = battleBonus(castle.bag().inventory)
    const transition = playBattleTransition(title, subtitle)
    void transition.blackout.then(() => {
        challenging = false
        encounterOverlay.open({id, speciesKey, position: {x: castle.state!.x, y: castle.state!.z}},
            {title, bonus: {...bonus, text: describeBonus(bonus)}, ...victory})
        transition.leave()
    })
}

function enterCastle(now: number, resume?: Parameters<typeof castle.enter>[3]) {
    stopWalking()
    stepsSinceGhost = 0
    boat.visible = false
    castle.enter(trainer, pikachu?.root ?? null, now, resume)
    castleAudio.enter()
    rig.snap(trainer.position, CASTLE_FRAMING)
    renderer.toneMappingExposure = CASTLE_EXPOSURE
    lastHud = ''
}

/** Retour devant la grande porte, face à l'ouest ; Pikachu suit une case derrière. */
function leaveCastle(now: number) {
    castle.leave()
    castleAudio.leave()
    minimap.draw(null, null, false)
    renderer.toneMappingExposure = OUTDOOR_EXPOSURE
    stopWalking()
    player = {...player, direction: 'left', position: {...CASTLE_DOORSTEP}}
    from = to = tileCenter(CASTLE_DOORSTEP.x, CASTLE_DOORSTEP.y)
    followerFrom = followerTo = tileCenter(CASTLE_DOORSTEP.x + 1, CASTLE_DOORSTEP.y)
    stepStart = now - STEP_DURATION
    trainer.rotation.y = ANGLES.left
    rig.snap(to, outdoorFraming())
    lastHud = ''
}

let challenging = false

/** E devant Mewtwo : le duel final. Vaincu, il quitte le trône ; avec la Master Ball, il est capturé. */
function challengeMewtwo() {
    const capture = capturesBoss(castle.bag().inventory)
    startCastleBattle(castle.boss.speciesKey, 'Mewtwo !', 'Le Pokémon génétique se dresse devant le trône', 'mewtwo-chateau', {
        victoryText: capture ? 'Tu lances la Master Ball… Mewtwo est capturé !' : 'Vaincu, Mewtwo s’enfuit à travers le vitrail.',
        onVictory: () => {
            castle.defeatBoss(performance.now(), capture)
            if (capture && !captured.includes('mewtwo')) captured = [...captured, 'mewtwo']
            persist()
        },
    })
}

/** E dans le château : Mewtwo à portée, sinon examiner (mur creux, autel). */
function interactInCastle(now: number) {
    if (castle.nearBoss()) return challengeMewtwo()
    const event: CastleEvent | null = castle.interact(now)
    if (event) castleAudio.play(event, castle.state!)
}

addEventListener('keydown', (event) => {
    if (encounterOverlay.isOpen || challenging || event.ctrlKey || event.metaKey || event.altKey) return
    const key = event.key.toLowerCase()
    castleAudio.resume()
    if (key === 'm' && !event.repeat && castle.active) {
        castleAudio.toggleMute()
        lastHud = ''
        return
    }
    if (key === 'v' && !event.repeat) {
        rig.cycle(castle.state?.facing ?? player.direction)
        lastHud = ''
        return
    }
    if (key === 'e') {
        if (event.repeat) return

        event.preventDefault()
        stopWalking()
        if (castle.active) return interactInCastle(performance.now())
        const nearCharmander =
            player.travelMode === 'walking'
            && canInteractWithPokemon(player.position, wildCharmander)

        if (nearCharmander) {
            encounterOverlay.open(wildCharmander)
            return
        }
        const near = player.travelMode === 'walking' ? pokemonNear(villagePokemon, player.position) : undefined
        if (near?.profile.wild) {
            encounterOverlay.open({id: `${near.profile.id}-${Date.now()}`, speciesKey: near.profile.speciesKey, position: {...player.position}})
            return
        }
        if (near) {
            dialogue = {name: near.profile.name, job: 'Pokémon', text: near.profile.lore, until: performance.now() + 6000}
            lastHud = ''
            return
        }
        const talk = player.travelMode === 'walking' ? talkTo(villagers, player.position, hour, {bossDefeated: castle.bossDefeated}, said) : null
        if (talk) {
            const {name, job} = talk.villager.profile
            dialogue = {name, job, text: talk.text, until: performance.now() + 6000}
            lastHud = ''
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
    if (event.repeat && !pressed.has(direction)) return
    // Nouvelle touche : le repère de la vue est figé jusqu'à ce qu'elles soient toutes relâchées.
    if (direction !== held) rig.press()
    held = direction
    pressed.add(direction)
})
addEventListener('keyup', (event) => {
    const direction = KEYS[event.key.toLowerCase()]
    if (!direction) return
    pressed.delete(direction)
    if (direction !== held) return
    // Dehors, la dernière touche encore enfoncée reprend la main.
    held = [...pressed].at(-1) ?? null
    if (!held) rig.release()
})
addEventListener('blur', stopWalking)

/** Sauvegarde dans le navigateur : position (dehors ou dans le château), objets ramassés, portes ouvertes. */
function persist() {
    if (discarded) return
    const inside = castle.state
    saveGame(localStorage, {
        player,
        castle: inside ? {floor: inside.floor, x: inside.x, z: inside.z, facing: inside.facing} : resumeInCastle,
        ...castle.bag(),
        bossDefeated: castle.bossDefeated,
        captured,
    })
}

/** Nouvelle partie : après confirmation, la sauvegarde est effacée et Clairbois repart du début. */
function newGame() {
    if (!confirm('Effacer la sauvegarde et recommencer une nouvelle partie ?')) return
    discarded = true
    clearGame(localStorage)
    location.reload()
}
// `pagehide` couvre la fermeture de l'onglet, le rechargement et le départ vers le monde ouvert ; un onglet masqué
// peut être tué sans prévenir (mobile, navigateur fermé), d'où la sauvegarde aussi au passage en arrière-plan.
addEventListener('pagehide', persist)
document.addEventListener('visibilitychange', () => {
    castleAudio.setHidden(document.hidden)
    if (document.visibilityState === 'hidden') persist()
})
addEventListener('wheel', (event) => {
    if (encounterOverlay.isOpen) return
    zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.001, 0.45, 1.8)
}, {passive: true})

const hud = document.createElement('div')
hud.className = 'world3d-hud'
document.body.appendChild(hud)
hud.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.closest('.world3d-new-game')) newGame()
})
const NEW_GAME = '<p><button type="button" class="world3d-new-game">Nouvelle partie</button></p>'
let lastHud = ''
const encounterOverlay = createEncounterOverlay({
    background: [host, hud],
    onPause: () => {
        stopWalking()
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
        const text = castle.hud(now, `${viewHelp()} · M : ${castleAudio.muted ? 'remettre' : 'couper'} le son`)
        if (text === lastHud) return
        lastHud = text
        hud.innerHTML = text + NEW_GAME
        return
    }
    const loading = Math.round(Math.min(materials.progress(), village ? streamer.progress(player.position) : 0) * 100)
    const landmark = nearbyLandmark(WORLD_MAP, player.position)
    const boatAction = boatActionAtDock(player)
    const exit = nearExit(player.position)
    const nearCharmander = player.travelMode === 'walking' && canInteractWithPokemon(player.position, wildCharmander)
    if (dialogue && now > dialogue.until) dialogue = null
    const neighbour = player.travelMode === 'walking' ? villagers.find((villager) => !villager.inside && !villager.next
        && Math.abs(villager.tile.x - player.position.x) + Math.abs(villager.tile.y - player.position.y) === 1) : undefined
    const beast = player.travelMode === 'walking' ? pokemonNear(villagePokemon, player.position) : undefined
    const time = formatHour(Math.floor(hour * 4) / 4)
    const text = `${zoneAt(player.position)}|${landmark?.name}|${boatAction}|${loading}|${exit}|${nearCharmander}|${captured}|${time}|${dialogue?.text}|${neighbour?.profile.id}|${beast?.profile.id}`
    if (text === lastHud) return
    lastHud = text
    hud.innerHTML = `<strong>${zoneAt(player.position)} · ${time}</strong>`
        + (dialogue ? `<p class="world3d-dialogue"><b>${dialogue.name}</b> <i>(${dialogue.job})</i> — ${dialogue.text}</p>` : '')
        + (!dialogue && neighbour ? `<p>E : parler à ${neighbour.profile.name} <i>(${neighbour.profile.job})</i></p>` : '')
        + (!dialogue && beast ? `<p>E : ${beast.profile.wild ? `combattre ${beast.profile.name} <i>(sauvage)</i>` : `observer ${beast.profile.name}`}</p>` : '')
        + (landmark ? `<p><b>${landmark.name}</b> — ${landmark.message}</p>` : '')
        + (loading < 100 ? `<p>Chargement du monde… ${loading} %</p>` : '')
        + (exit ? '<p><b>Sortie est</b> — continue vers l’est pour rejoindre le monde ouvert.</p>' : '')
        + (nearCharmander ? '<p><b>Salamèche</b> — E : ouvrir le combat</p>' : '')
        + (boatAction ? `<p>E : ${boatAction === 'board' ? 'embarquer' : 'débarquer'}</p>` : '')
        + (captured.includes('mewtwo') ? '<p>Équipe : Pikachu, Mewtwo</p>' : '')
        + `<p class="world3d-help">Flèches / ZQSD pour marcher · ${viewHelp()} · <a href="/">carte 2D</a> · <a href="/open-world.html">monde ouvert</a></p>`
        + NEW_GAME
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
    // Le village continue de vivre pendant qu'on explore le château.
    hour = advanceHour(hour, delta)
    updateVillagers(villagers, hour, delta, player.position, walkable, (tile) => pokemonAt(villagePokemon, tile) !== undefined)
    updateVillagePokemon(villagePokemon, hour, delta, {player: player.position, passable: walkable, villagers, random: Math.random})
    if (castle.active) {
        // À l'intérieur : seul le château est animé et dessiné ; Clairbois attend dehors.
        walkInCastle(delta, now)
        if (!castle.active) return
        castle.update(now, delta)
        companions.forEach(({mixer}) => mixer.update(delta))
        trainer.visible = rig.mode !== 'fps'
        rig.update(delta, trainer.position, castle.state!.facing, pressed.size > 0, CASTLE_FRAMING)
        castleAudio.update(castle.state, encounterOverlay.isOpen || challenging)
        minimap.draw(castle.state, castle.where(), castle.bossDefeated)
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
    applyDaylight(DAY, daylight(hour))

    // En vue FPS le dresseur disparaît : la caméra est sa tête.
    trainer.visible = rig.mode !== 'fps'
    rig.update(delta, trainer.position, player.direction, held !== null, outdoorFraming())
    // Passants et Pokémon après la caméra : seuls ceux qu'elle voit sont dessinés et animés.
    camera.updateMatrixWorld()
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    villagerView.update(delta, trainer.position, true, frustum)
    villagePokemonView.update(now / 1000, delta, trainer.position, true)
    // La carte d'ombre suit le regard : l'avant de la scène a ses ombres avant qu'on s'en approche.
    followShadow(sun, sunDirection, camera, trainer.position, 10, 40)
    castleOutside.update(now / 1000)

    updateHud(now)
    water.prepare(camera, now / 1000, dryObjects())
    post.render()
    resolution.update(now, frameSeconds)
}

renderer.setAnimationLoop(animate)
