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
import { buildDecorChunk, buildGrassChunk, buildWorldBase, disposeChunk, tileCenter } from './buildWorld3D'
import { createTerrain, RIVER_LEVEL } from './terrain'
import { createWater } from './water'
import { CHUNK_SIZE, GRASS_RADIUS, GRASS_UNLOAD_RADIUS, LOAD_RADIUS, UNLOAD_RADIUS, VIEW_DISTANCE } from './worldChunks'
import { createWorldMaterials } from './worldMaterials'
import { leadsToOpenWorld, nearExit, OPEN_WORLD_URL } from './worldExit'
import { createAtmosphere, createResolutionScaler, createTrainer, followShadow } from './scenery'
import { createFirstPersonView } from './firstPerson'
import type { CameraFraming } from './cameraRig'
import { createCameraRig } from './cameraRig'
import { createCameraObstacles } from './cameraObstacles'
import { prepareTrees } from './realTrees'
import type { VillageModels } from './villageModels'
import { loadVillageModels } from './villageModels'
import { createVillageProps } from './villageProps'
import { createPostProcessing } from './postProcessing'
import { WorldStreamer } from './worldStreamer'
import { createEncounterOverlay } from './encounterOverlay'
import { createVillageMap } from './villageMapOverlay'
import { createVillageAudio } from './villageAudio'
import { createVillageAudioControls } from './villageAudioControls'
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
import { createVillagers, positionOf, talkTo, updateVillagers, VILLAGERS, villagerAt } from './village/villagers'
import { createVillagerView } from './village/villagerView'
import { createVillagePokemon, pokemonAt, pokemonNear, pokemonPosition, updateVillagePokemon, VILLAGE_POKEMON } from './village/villagePokemon'
import { createVillagePokemonView } from './village/villagePokemonView'
import { advanceHour, DAY_SECONDS, formatHour, START_HOUR } from './village/villageClock'
import { createFlood, isFlooded, stepFlood, surfaceAt, WADE, WET } from './village/flood'
import { createFloodView } from './village/floodView'
import { createRain } from './village/rainView'
import { createWeather, describeWeather, floodLevels, startRain, updateWeather } from './village/weather'
import { applyDaylight, createCloudCover, daylight } from './village/dayCycle'
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
// La brume laisse les premiers plans nets, puis masque la limite du décor chargé.
scene.fog = new THREE.Fog(0xa9c4d4, VIEW_DISTANCE / 2, VIEW_DISTANCE)
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
    weather: () => weather, flood: () => flood,
    /** Averse (`storm` : orage, qui fait déborder la rivière) de `hours` heures de jeu. */
    rain: (hours = 3, storm = false) => startRain(weather, hours, storm),
    /** Avance la crue de `seconds` secondes d'un coup, aux niveaux actuels (le navigateur de test ne tourne pas en continu). */
    simulate: (seconds: number) => {
        for (let time = 0; time < seconds; time += 1 / 30) stepFlood(flood, 1 / 30, floodLevels(weather))
    },
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
// Relief : le bourg sur un plateau, la vallée de la rivière en contrebas, des cuvettes aux champs et à l'enclos.
const terrain = createTerrain(WORLD_MAP)
const base = buildWorldBase(scene, WORLD_MAP, materials, terrain)
// Météo et crue : la pluie fait monter la nappe, l'orage fait déborder la rivière ; maisons et château arrêtent l'eau.
const weather = createWeather()
const isBuilding = (tile: Position) => WORLD_MAP.buildings.some((building) => tile.x >= building.x && tile.x < building.x + building.width
    && tile.y >= building.y && tile.y < building.y + building.height)
const flood = createFlood(WORLD_MAP, terrain, (tile) => isBuilding(tile) || insideCastleWalls(tile), floodLevels(weather))
const floodView = createFloodView(flood)
floodView.update(weather.rise)
materials.floodMap.value = floodView.texture
// Surface locale qui suit le joueur : densité des vagues constante, même quand la carte grandit.
// Le brouillard masque son bord ; la texture de crue continue de décrire toute la carte.
const WATER_REACH = (LOAD_RADIUS + 2) * CHUNK_SIZE
const water = createWater(renderer, scene, sunDirection, {
    width: WATER_REACH * 2, depth: WATER_REACH * 2, segments: 240, focused: true,
    waveHeight: 0.02, wavelength: 2.4, shallowColor: 0xcfe6dc, deepColor: 0x0e3438, absorption: 3.2, foamWidth: 0.1,
    surface: {map: floodView.texture, rect: floodView.rect, muddyColor: 0x7a5c3e},
})
water.mesh.position.set(WORLD_SPAWN.x + 0.5, RIVER_LEVEL, WORLD_SPAWN.y + 0.5)
const rain = createRain(scene)
const streamer = new WorldStreamer(WORLD_MAP, scene, [
    {
        name: 'decor',
        loadRadius: LOAD_RADIUS,
        unloadRadius: UNLOAD_RADIUS,
        build: (chunk) => buildDecorChunk(WORLD_MAP, chunk, village!, villageProps, terrain, materials),
        dispose: disposeChunk
    },
    {
        name: 'grass',
        loadRadius: GRASS_RADIUS,
        unloadRadius: GRASS_UNLOAD_RADIUS,
        build: (chunk) => buildGrassChunk(WORLD_MAP, chunk, materials, terrain, isCastleGround),
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
const villageAudio = createVillageAudio(WORLD_MAP)
const villageAudioControls = createVillageAudioControls(document.body, villageAudio)
const audioForward = new THREE.Vector3()
renderer.domElement.addEventListener('pointerdown', () => villageAudio.resume())
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
const villagerView = createVillagerView(scene, villagers, terrain.height)
// Pokémon du village : au travail, au pré, sur les lanternes, dans le lac… et deux sauvages (Évoli, Fantominus la nuit).
const villagePokemon = createVillagePokemon(VILLAGE_POKEMON, Math.random)
/** Niveau de l'eau en un point : la crue là où elle est, sinon la rivière. */
const waterLevel = (x: number, z: number) => surfaceAt(flood, {x: Math.floor(x), y: Math.floor(z)}) ?? floodLevels(weather).river
const villagePokemonView = createVillagePokemonView(scene, villagePokemon, terrain.height, waterLevel)
/**
 * Cases à moins de `reach` cases (en carré) d'une eau : rivière, lac ou terre noyée. Recalculé chaque seconde pendant
 * la crue : une passe par ligne puis une par colonne, sans parcourir tout le carré autour de chaque case mouillée.
 */
function aroundWater(reach: number) {
    const {width, height} = WORLD_MAP
    const spread = (wet: (x: number, y: number) => boolean, alongX: boolean) => {
        const near = new Uint8Array(width * height)
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            for (let step = -reach; step <= reach; step++) {
                const nx = alongX ? x + step : x, ny = alongX ? y : y + step
                if (nx >= 0 && ny >= 0 && nx < width && ny < height && wet(nx, ny)) {
                    near[y * width + x] = 1
                    break
                }
            }
        }
        return near
    }
    const rows = spread((x, y) => flood.river[y * width + x] === 1 || flood.depth[y * width + x] > WET, true)
    const near = spread((x, y) => rows[y * width + x] === 1, false)
    return (x: number, z: number) => {
        const tx = Math.floor(x), ty = Math.floor(z)
        return tx >= 0 && ty >= 0 && tx < width && ty < height && near[ty * width + tx] === 1
    }
}
/** Près d'une rive, on peut se voir à travers l'eau ; à moins d'un chunk, son reflet reste visible (arbres de l'autre rive). */
let nearShore = aroundWater(4), nearMirror = aroundWater(CHUNK_SIZE + 2)
let chunkReach = new WeakMap<THREE.Object3D, { shore: boolean; mirrored: boolean }>()
/** Champs noyés où Magicarpe peut sauter. */
let pools: Position[] = []
let shoresAt = 0
/** Les rives bougent avec la crue : recalculées une fois par seconde. */
function followShores(now: number) {
    if (now - shoresAt < 1000) return
    shoresAt = now
    nearShore = aroundWater(4)
    nearMirror = aroundWater(CHUNK_SIZE + 2)
    chunkReach = new WeakMap()
    pools = []
    for (let y = 0; y < WORLD_MAP.height; y++) for (let x = 0; x < WORLD_MAP.width; x++) {
        if (tileAt(WORLD_MAP, {x, y}) !== 'water' && flood.depth[y * WORLD_MAP.width + x] > 0.3) pools.push({x, y})
    }
}

/** Ce que les passes de l'eau peuvent ignorer : objets ni vus à travers l'eau (`refraction`) ni reflétés (`reflection`). */
function dryObjects() {
    const actors = [...villagerView.roots(), ...villagePokemonView.roots()].filter((root) => !nearShore(root.position.x, root.position.z))
    const chunks = scene.children.filter((object) => object.name.startsWith('decor') || object.name.startsWith('grass'))
    const reach = (chunk: THREE.Object3D) => {
        if (!chunkReach.has(chunk)) {
            const [cx, cy] = chunk.name.split(' ')[1].split(',').map(Number)
            const tiles = Array.from({length: CHUNK_SIZE * CHUNK_SIZE}, (_, index) => [cx * CHUNK_SIZE + index % CHUNK_SIZE, cy * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE)])
            chunkReach.set(chunk, {shore: tiles.some(([x, z]) => nearShore(x, z)), mirrored: tiles.some(([x, z]) => nearMirror(x, z))})
        }
        return chunkReach.get(chunk)!
    }
    // La pluie n'a ni reflet ni réfraction : dessinée une seule fois, devant l'eau.
    return {
        reflection: [rain.object, ...actors, ...chunks.filter((chunk) => !reach(chunk).mirrored || chunk.name.startsWith('grass'))],
        refraction: [rain.object, ...actors, ...chunks.filter((chunk) => !reach(chunk).shore)],
    }
}
const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4()
const walkable = (tile: Position) => canEnter(tileAt(WORLD_MAP, tile), 'walking') && !insideCastleWalls(tile) && !isFlooded(flood, tile)
/** Dernière fois que l'eau a arrêté le dresseur (message du HUD). */
let wadeBlocked = -Infinity
/** Répliques déjà entendues, par habitant : la conversation avance à chaque visite. */
const said = new Map<string, number>()
let dialogue: { name: string; job: string; text: string; until: number } | null = null
const clouds = createCloudCover()
scene.add(clouds)
const DAY = {scene, clouds, sun, sunDirection, sky, hemisphere, lanterns: lanternGlass}

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
    root.position.y = terrain.tile(wildCharmander.position)
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
    if (player.travelMode === 'walking' && isFlooded(flood, position)) {
        player = {...player, direction}
        wadeBlocked = now
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
    villageAudio.setActive(false)
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
    villageAudio.setActive(true)
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
    if (encounterOverlay.isOpen || villageMap.isOpen || challenging || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target instanceof HTMLElement && (event.target.closest('input, textarea, select') || event.target.isContentEditable)) return
    const key = event.key.toLowerCase()
    castleAudio.resume()
    villageAudio.resume()
    if (key === 'm' && !event.repeat && !castle.active) {
        event.preventDefault()
        villageAudio.toggle()
        return
    }
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
            villageAudio.say({...pokemonPosition(near), id: near.profile.id, kind: 'cry', species: near.profile.speciesKey, radius: 16, level: 0.4})
            dialogue = {name: near.profile.name, job: 'Pokémon', text: near.profile.lore, until: performance.now() + 6000}
            lastHud = ''
            return
        }
        const talk = player.travelMode === 'walking' ? talkTo(villagers, player.position, hour, {bossDefeated: castle.bossDefeated}, said) : null
        if (talk) {
            const {name, job} = talk.villager.profile
            villageAudio.say({...positionOf(talk.villager), id: talk.villager.profile.id,
                kind: talk.villager.profile.child ? 'child' : 'voice', radius: 10, level: 0.28})
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
    villageAudio.setHidden(document.hidden)
    if (document.visibilityState === 'hidden') persist()
})
addEventListener('pagehide', (event) => {
    if (event.persisted) villageAudio.setHidden(true)
    else { villageAudio.dispose(); villageAudioControls.dispose() }
})
addEventListener('pageshow', () => villageAudio.setHidden(document.hidden))
addEventListener('wheel', (event) => {
    if (encounterOverlay.isOpen || villageMap.isOpen) return
    zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.001, 0.45, 1.8)
}, {passive: true})

const hud = document.createElement('div')
hud.className = 'world3d-hud'
document.body.appendChild(hud)
hud.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.closest('.world3d-map-button')) villageMap.open()
    if (event.target instanceof HTMLElement && event.target.closest('.world3d-new-game')) newGame()
})
const NEW_GAME = '<p><button type="button" class="world3d-new-game">Nouvelle partie</button></p>'
const MAP_BUTTON = '<p><button type="button" class="world3d-map-button" aria-haspopup="dialog" aria-keyshortcuts="C">Afficher la carte <kbd>C</kbd></button></p>'
let lastHud = ''
const encounterOverlay = createEncounterOverlay({
    background: [host, hud, villageAudioControls.element],
    onPause: () => {
        villageAudio.setActive(false)
        stopWalking()
        rig.setActive(false)
        renderer.setAnimationLoop(null)
    },
    onResume: () => {
        villageAudio.setActive(!castle.active)
        held = null
        rig.setActive(true)
        clock.getDelta()
        renderer.setAnimationLoop(animate)
    },
})

const villageMap = createVillageMap({
    map: WORLD_MAP,
    extraPoints: [{id: wildCharmander.id, name: 'Salamèche sauvage', description: 'Approche Salamèche et appuie sur E pour ouvrir un combat.',
        ...wildCharmander.position, category: 'rencontre'}],
    location: () => ({position: {...player.position}, direction: player.direction, insideCastle: castle.active}),
    canOpen: () => !encounterOverlay.isOpen && !challenging,
    onPause: () => {
        villageAudio.setActive(false)
        stopWalking()
        rig.setActive(false)
        castleAudio.setHidden(true)
        renderer.setAnimationLoop(null)
    },
    onResume: () => {
        villageAudio.setActive(!castle.active)
        stopWalking()
        rig.setActive(true)
        castleAudio.setHidden(document.hidden)
        clock.getDelta()
        renderer.setAnimationLoop(animate)
    },
})

/** Images par seconde, lissées ; le HUD n'en montre une nouvelle valeur que deux fois par seconde. */
let fps = 60, shownFps = 60, fpsShownAt = 0

function measureFps(now: number, frameSeconds: number) {
    fps = fps * 0.95 + (1 / Math.max(frameSeconds, 0.001)) * 0.05
    if (now - fpsShownAt < 500) return
    fpsShownAt = now
    shownFps = Math.round(fps)
}

function performanceLine() {
    return `<p>${shownFps} i/s · résolution ×${resolution.ratio().toFixed(2)}</p>`
}

function updateHud(now: number) {
    if (castle.active) {
        const text = castle.hud(now, `${viewHelp()} · M : ${castleAudio.muted ? 'remettre' : 'couper'} le son`) + performanceLine()
        if (text === lastHud) return
        lastHud = text
        hud.innerHTML = text + MAP_BUTTON + NEW_GAME
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
    const sky = describeWeather(weather)
    const wading = now - wadeBlocked < 2500
    const text = `${zoneAt(player.position)}|${landmark?.name}|${boatAction}|${loading}|${exit}|${nearCharmander}|${captured}|${time}|${dialogue?.text}|${neighbour?.profile.id}|${beast?.profile.id}|${sky}|${wading}|${performanceLine()}`
    if (text === lastHud) return
    lastHud = text
    hud.innerHTML = `<strong>${zoneAt(player.position)} · ${time}${sky ? ` · ${sky}` : ''}</strong>`
        + (wading ? `<p>L’eau est trop profonde pour passer à pied (plus de ${Math.round(WADE * 100)} cm).</p>` : '')
        + (dialogue ? `<p class="world3d-dialogue"><b>${dialogue.name}</b> <i>(${dialogue.job})</i> — ${dialogue.text}</p>` : '')
        + (!dialogue && neighbour ? `<p>E : parler à ${neighbour.profile.name} <i>(${neighbour.profile.job})</i></p>` : '')
        + (!dialogue && beast ? `<p>E : ${beast.profile.wild ? `combattre ${beast.profile.name} <i>(sauvage)</i>` : `observer ${beast.profile.name}`}</p>` : '')
        + (landmark ? `<p><b>${landmark.name}</b> — ${landmark.message}</p>` : '')
        + (loading < 100 ? `<p>Chargement du monde… ${loading} %</p>` : '')
        + (exit ? '<p><b>Sortie est</b> — continue vers l’est pour rejoindre le monde ouvert.</p>' : '')
        + (nearCharmander ? '<p><b>Salamèche</b> — E : ouvrir le combat</p>' : '')
        + (boatAction ? `<p>E : ${boatAction === 'board' ? 'embarquer' : 'débarquer'}</p>` : '')
        + (captured.includes('mewtwo') ? '<p>Équipe : Pikachu, Mewtwo</p>' : '')
        + performanceLine()
        + `<p class="world3d-help">Flèches / ZQSD pour marcher · ${viewHelp()} · <a href="/">carte 2D</a> · <a href="/open-world.html">monde ouvert</a></p>`
        + MAP_BUTTON + NEW_GAME
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
// Dehors, la caméra s'arrête devant les maisons et les remparts au lieu de les traverser.
OUTDOOR_FRAMING.reach = createCameraObstacles(WORLD_MAP)
// En développement, un panneau règle l'heure, la météo, la caméra et le rendu en direct (absent du build).
if (import.meta.env.DEV) void import('./devPanel').then(({createDevPanel}) => createDevPanel({
    renderer, scene, sun, weather, cameraOffset: CAMERA_OFFSET, framing: OUTDOOR_FRAMING, resolution,
    hour: {get: () => hour, set: (value) => { hour = value }},
    zoom: {get: () => zoom, set: (value) => { zoom = value }},
    rain: (hours, storm) => startRain(weather, hours, storm),
    simulate: (seconds) => {
        for (let time = 0; time < seconds; time += 1 / 30) stepFlood(flood, 1 / 30, floodLevels(weather))
    },
}))

const clock = new THREE.Clock()
let floodViewTime = 0
camera.position.copy(from).add(new THREE.Vector3(0, 7, 8))

function animate(now: number) {
    const frameSeconds = clock.getDelta()
    measureFps(now, frameSeconds)
    const delta = Math.min(frameSeconds, 0.05)
    step(now)
    // Le village continue de vivre pendant qu'on explore le château.
    hour = advanceHour(hour, delta)
    updateWeather(weather, delta * 24 / DAY_SECONDS, Math.random)
    stepFlood(flood, delta, floodLevels(weather))
    followShores(now)
    updateVillagers(villagers, hour, delta, player.position, walkable, (tile) => pokemonAt(villagePokemon, tile) !== undefined, weather.rain > 0.45, 48)
    updateVillagePokemon(villagePokemon, hour, delta, {player: player.position, passable: walkable, villagers, random: Math.random, rain: weather.rain, pools, activityRadius: 48})
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
    trainer.position.y = onBoat ? waterLevel(trainer.position.x, trainer.position.z) + 0.1 : terrain.height(trainer.position.x, trainer.position.z)
    // Petite marge après chaque pas : la marche ne se coupe pas entre deux cases enchaînées.
    trainer.animate(delta, !onBoat && now - stepStart < STEP_DURATION + 60 ? 'walk' : 'idle')
    trainer.rotation.y = THREE.MathUtils.lerp(trainer.rotation.y, ANGLES[player.direction], 0.25)
    boat.visible = onBoat
    boat.position.set(trainer.position.x, waterLevel(trainer.position.x, trainer.position.z) + Math.sin(now * 0.002) * 0.03, trainer.position.z)
    boat.rotation.y = trainer.rotation.y

    if (pikachu) {
        const {root} = pikachu
        root.visible = !onBoat
        root.position.lerpVectors(followerFrom, followerTo, progress)
        root.position.y = terrain.height(root.position.x, root.position.z)
        const dx = followerTo.x - followerFrom.x, dz = followerTo.z - followerFrom.z
        if (dx * dx + dz * dz > 0.01) root.rotation.y = Math.atan2(dx, dz)
    }
    companions.forEach(({mixer}) => mixer.update(delta))
    base.update(now / 1000)
    applyDaylight(DAY, daylight(hour), weather.rain)
    // La crue avance à 30 Hz : inutile de convertir et transférer sa texture à 60 ou 144 Hz.
    floodViewTime += delta
    if (floodViewTime >= 1 / 30) {
        floodView.update(weather.rise)
        floodViewTime %= 1 / 30
    }
    water.mesh.position.x = trainer.position.x
    water.mesh.position.z = trainer.position.z
    water.setRain(weather.rain)
    materials.wetness.value = Math.min(1, weather.soak * 2.5)

    // En vue FPS le dresseur disparaît : la caméra est sa tête.
    trainer.visible = rig.mode !== 'fps'
    rig.update(delta, trainer.position, player.direction, held !== null, outdoorFraming())
    villageAudio.update({listener: trainer.position, forward: camera.getWorldDirection(audioForward), villagers, pokemon: villagePokemon,
        extraPokemon: [
            ...(pikachu ? [{id: 'compagnon-pikachu', species: 'pikachu', x: pikachu.root.position.x - 0.5, y: pikachu.root.position.z - 0.5}] : []),
            {id: wildCharmander.id, species: wildCharmander.speciesKey, ...wildCharmander.position},
        ], rain: weather.rain})
    // Passants et Pokémon après la caméra : seuls ceux qu'elle voit sont dessinés et animés.
    camera.updateMatrixWorld()
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    villagerView.update(delta, trainer.position, true, frustum)
    villagePokemonView.update(now / 1000, delta, trainer.position, true)
    // La carte d'ombre suit le regard : l'avant de la scène a ses ombres avant qu'on s'en approche.
    followShadow(sun, sunDirection, camera, trainer.position, 10, 40)
    castleOutside.update(now / 1000)
    rain.update(now / 1000, weather.rain, camera)
    clouds.position.copy(camera.position)

    updateHud(now)
    water.prepare(camera, now / 1000, dryObjects())
    post.render()
    resolution.update(now, frameSeconds)
}

renderer.setAnimationLoop(animate)
