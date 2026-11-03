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
import { CHUNK_SIZE } from './worldChunks'
import { gpuName, pickQuality } from './graphicsQuality'
import { createGpuTimer } from './gpuTimer'
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
import type { Target, WeaponId } from './village/combat'
import { aimAt, createLife, passTime, strike, weaponById } from './village/combat'
import { createWeaponMenu } from './village/weaponMenu'
import { createWeaponView } from './village/weaponView'
import { createPolice, describePolice, finishArrest, hasPoliceSight, officerPosition, policeAt, reportKilling, resumeAfterResistance, updatePolice } from './village/police'
import { createMountedPoliceView } from './village/mountedPoliceView'
import { createArrestOverlay } from './arrestOverlay'
import { createGuardDuel, duelHealth, guardWasHit, updateGuardDuel, type GuardDuel } from './village/guardDuel'
import { createGuardDuelView } from './village/guardDuelView'
import { createPrison, defeatWarden, interactPrison, prisonInteraction, prisonPassable, WARDEN_SPAWN, type PrisonState } from './prison/prison'
import { createPrisonView } from './prison/prisonView'
import { PRISON_ENTRANCE } from './prison/prisonLocation'
import { createGoreView } from './village/goreView'
import type { KillingBlow } from './village/villagerView'
import { createPhysics } from './physicsWorld'
import type { AttackGait } from './scenery'
import { createVillagePokemon, pokemonAt, pokemonNear, pokemonPosition, updateVillagePokemon, VILLAGE_POKEMON } from './village/villagePokemon'
import { createVillagePokemonView } from './village/villagePokemonView'
import { advanceHour, DAY_SECONDS, formatHour, START_HOUR } from './village/villageClock'
import { createFlood, depthAt, isFlooded, stepFlood, surfaceAt, WADE, WET } from './village/flood'
import type { FishingEvent, WaterKind } from './village/fishing'
import { castDistance, castLine, createFishing, describeFishing, FISH, isFishing, moveAngler, reelIn, updateFishing } from './village/fishing'
import { createFishingView } from './village/fishingView'
import { createFloodView } from './village/floodView'
import { createRain } from './village/rainView'
import { createWeather, describeWeather, floodLevels, startRain, updateWeather } from './village/weather'
import { applyDaylight, createCloudCover, daylight } from './village/dayCycle'
import { lanternGlass } from './villageProps'
import { bankAngle, createBicycle, createRiderPose, WHEELBASE } from './bicycle'
import type { BikeState } from './bikeRide'
import { createRide, updateRide } from './bikeRide'

const STEP_DURATION = 170
/** À l'arrêt, le vélo penche à gauche, sur le pied posé au sol. */
const BIKE_STOP_LEAN = -0.2/** Temps de construction de chunks accordé par image : le reste du budget de 16 ms va au rendu. */
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
const quality = pickQuality(gpuName(renderer.getContext()), location.search, devicePixelRatio)
// Compteurs cumulés sur toute l'image (ombre, occlusion, eau, post-traitement), remis à zéro par animate.
renderer.info.autoReset = false

const scene = new THREE.Scene()
// La brume laisse les premiers plans nets, puis masque la limite du décor chargé.
scene.fog = new THREE.Fog(0xa9c4d4, quality.viewDistance / 2, quality.viewDistance)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1200)

// Carte d'ombre plus large et plus fine, centrée devant la caméra (voir followShadow).
const {sun, sunDirection, sky, hemisphere} = createAtmosphere(renderer, scene, quality.shadowExtent, quality.shadowMapSize)
const firstPerson = createFirstPersonView(renderer.domElement, camera)
const rig = createCameraRig(camera, renderer.domElement, firstPerson)
const post = createPostProcessing(renderer, scene, camera, quality)
// En développement, la scène est exposée pour mesurer le coût du rendu depuis la console.
if (import.meta.env.DEV) Object.assign(window, {world3d: {
    renderer, scene, camera, post, quality, water: () => water, castle: () => castle, villagers: () => villagers, police: () => police,
    detention: () => ({prison, duel: guardDuel}),
    setHour: (value: number) => { hour = value },
    weather: () => weather, flood: () => flood, fishing: () => fishing, bike: () => bike, physics: () => physics,
    /** Averse (`storm` : orage, qui fait déborder la rivière) de `hours` heures de jeu. */
    rain: (hours = 3, storm = false) => startRain(weather, hours, storm),
    /** Avance la crue de `seconds` secondes d'un coup, aux niveaux actuels (le navigateur de test ne tourne pas en continu). */
    simulate: (seconds: number) => {
        for (let time = 0; time < seconds; time += 1 / 30) stepFlood(flood, 1 / 30, floodLevels(weather))
    },
    teleport: (x: number, y: number) => {
        player = {...player, position: {x, y}}
        from = to = tileCenter(x, y)
        if (bike) Object.assign(bike, {x: to.x, z: to.z, speed: 0})
    },
    enterCastle: () => enterCastle(performance.now()),
}})

const materials = createWorldMaterials(WORLD_MAP, renderer, quality.anisotropy)
// Les chunks attendent que les arbres et les maisons soient prêts (modèles chargés, textures envoyées, shaders compilés) :
// rien n'apparaît à moitié chargé.
let village: VillageModels | null = null
void Promise.all([prepareTrees(renderer, scene, ['oak', 'aspen', 'pine']), loadVillageModels(renderer, quality.anisotropy)]).then(([, models]) => {
    village = models
})
const villageProps = createVillageProps(materials)
// Relief : le bourg sur un plateau, la vallée de la rivière en contrebas, des cuvettes aux champs et à l'enclos.
const terrain = createTerrain(WORLD_MAP)
// Physique des corps tombés (ragdolls, membres tranchés), et le sang qui va avec.
const physics = createPhysics(terrain.height)
const gore = createGoreView(scene, terrain.height)
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
const WATER_REACH = (quality.loadRadius + 2) * CHUNK_SIZE
const water = createWater(renderer, scene, sunDirection, {
    // Même finesse de vagues quelle que soit la portée : 240 segments pour le décor standard (64 unités de rayon).
    width: WATER_REACH * 2, depth: WATER_REACH * 2, segments: Math.round(240 * WATER_REACH / 64), focused: true,
    waveHeight: 0.02, wavelength: 2.4, shallowColor: 0xcfe6dc, deepColor: 0x0e3438, absorption: 3.2, foamWidth: 0.1,
    surface: {map: floodView.texture, rect: floodView.rect, muddyColor: 0x7a5c3e},
})
water.mesh.position.set(WORLD_SPAWN.x + 0.5, RIVER_LEVEL, WORLD_SPAWN.y + 0.5)
const rain = createRain(scene)
const streamer = new WorldStreamer(WORLD_MAP, scene, [
    {
        name: 'decor',
        loadRadius: quality.loadRadius,
        unloadRadius: quality.unloadRadius,
        build: (chunk) => buildDecorChunk(WORLD_MAP, chunk, village!, villageProps, terrain, materials),
        dispose: disposeChunk
    },
    {
        name: 'grass',
        loadRadius: quality.grassRadius,
        unloadRadius: quality.grassUnloadRadius,
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
// Lacet d'abord, puis tangage et roulis : le vélo suit la pente et penche dans les virages sans dévier de son cap.
trainer.rotation.order = 'YXZ'
const boat = createBoat()
scene.add(trainer, boat)

// Vélo (B) : conduite libre, hors de la grille des cases (voir bikeRide.ts) ; Pikachu voyage dans le siège enfant.
// On en descend pour parler, pêcher ou entrer au château, et le dresseur reprend alors la marche case par case.
const bicycle = createBicycle()
bicycle.group.visible = false
trainer.add(bicycle.group)
const rider = createRiderPose(trainer)
let saddleFitted = false
let bike: BikeState | null = null
/** 1 quand le vélo est à l'arrêt (pied au sol), 0 en roulant ; roulis lissé. */
let bikeStill = 1, bikeBank = 0
const AROUND: Direction[] = ['down', 'right', 'up', 'left']
/** Direction de la grille la plus proche d'un cap (0 : sud, π/2 : est). */
const directionOf = (heading: number) => AROUND[THREE.MathUtils.euclideanModulo(Math.round(heading / (Math.PI / 2)), 4)]
const tileOf = (x: number, z: number): Position => ({x: Math.floor(x), y: Math.floor(z)})
/** Sol praticable à vélo : comme à pied, sans foncer dans les habitants ni les Pokémon. */
function rideable(x: number, z: number) {
    const tile = tileOf(x, z)
    return walkable(tile) && !castleBlocks(tile) && !villagerAt(villagers, tile) && !pokemonAt(villagePokemon, tile) && !policeAt(police, tile)
}
function ride(on: boolean) {
    if ((bike !== null) === on) return
    bicycle.group.visible = on
    bikeStill = 1
    bikeBank = 0
    lastHud = ''
    if (on) {
        stopWalking()
        // Entre deux cases on part d'où l'on est ; sinon du centre de la case (l'image n'a peut-être pas encore suivi).
        const start = performance.now() - stepStart < STEP_DURATION ? trainer.position : to
        bike = createRide(start.x, start.z, ANGLES[player.direction])
        return
    }
    // Pied à terre : le dresseur rejoint le centre de sa case, Pikachu saute du siège sur la case derrière lui.
    const [dx, dz] = VECTORS[player.direction]
    const behind = {x: player.position.x - dx, y: player.position.y - dz}
    bike = null
    trainer.rotation.x = trainer.rotation.z = 0
    stopWalking()
    from = trainer.position.clone()
    to = tileCenter(player.position.x, player.position.y)
    followerFrom = pikachu?.root.position.clone() ?? to.clone()
    followerTo = walkable(behind) ? tileCenter(behind.x, behind.y) : to.clone()
    stepStart = performance.now()
}
/** Conduite : physique du vélo, collisions, case du dresseur, porte du château et sortie vers le monde ouvert. */
function rideBicycle(delta: number, now: number) {
    if (!bike || encounterOverlay.isOpen || challenging) return
    const input = {pedal: pressed.has('up'), brake: pressed.has('down'), turn: (pressed.has('left') ? 1 : 0) - (pressed.has('right') ? 1 : 0)}
    const bump = updateRide(bike, delta, input, rideable)
    const forward = {x: Math.sin(bike.heading), z: Math.cos(bike.heading)}
    const direction = directionOf(bike.heading)
    const tile = tileOf(bike.x, bike.z)
    if (tile.x !== player.position.x || tile.y !== player.position.y || direction !== player.direction) {
        player = {...player, position: tile, direction}
    }
    if (bump && input.pedal) {
        // Contre la grande porte du château ou au bout de la route est : on descend, et on passe.
        const ahead = tileOf(bike.x + forward.x, bike.z + forward.z)
        if (castleBlocks(ahead) && entersCastle(ahead, direction)) return enterCastle(now)
        if (leadsToOpenWorld(tile, direction)) {
            ride(false)
            location.assign(OPEN_WORLD_URL)
        }
    }
}
/** Le vélo épouse la pente, penche dans les virages ; roues, pédalier et chaîne tournent, et le pilote s'y pose. */
function poseBicycle(delta: number) {
    if (!bike) return
    const pedaling = pressed.has('up') && bike.speed >= 0
    bikeStill = THREE.MathUtils.clamp(bikeStill + (Math.abs(bike.speed) > 0.15 || pedaling ? -delta * 4 : delta * 2.5), 0, 1)
    if (!saddleFitted) {
        const leg = rider.legLength()
        if (leg) {
            // Selle à la bonne hauteur : jambe presque tendue, pédale en bas (cheville 0,2 m au-dessus du sol).
            bicycle.fitSaddle(0.2 + Math.sqrt((0.95 * leg) ** 2 - 0.14 ** 2) - 0.05)
            saddleFitted = true
        }
    }
    const half = WHEELBASE / 2, sin = Math.sin(bike.heading), cos = Math.cos(bike.heading)
    const front = terrain.height(bike.x + sin * half, bike.z + cos * half)
    const rear = terrain.height(bike.x - sin * half, bike.z - cos * half)
    trainer.position.set(bike.x, (front + rear) / 2, bike.z)
    trainer.rotation.set(-Math.atan2(front - rear, WHEELBASE), bike.heading, 0)
    // Roulis d'équilibre (tan = v·ω/g), lissé : le cycliste se couche puis se redresse en douceur.
    bikeBank += (bankAngle(bike.speed, bike.yawRate) - bikeBank) * Math.min(1, delta * 8)
    trainer.rotation.z = THREE.MathUtils.lerp(bikeBank, BIKE_STOP_LEAN, bikeStill)
    bicycle.update(bike.speed * delta, bike.steer, pedaling)
    trainer.updateMatrixWorld(true)
    rider.apply(bicycle, bikeStill)
}

// Château du pré sud-ouest : extérieur dans Clairbois, intérieur dans sa propre scène (trois étages, Mewtwo au sommet).
const castleMaterials = createCastleMaterials(renderer)
const castleOutside = buildCastleExterior(scene, castleMaterials)
const castle = createCastle(renderer, camera, castleMaterials, quality)
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
const villagerView = createVillagerView(scene, villagers, terrain.height, physics)
// Pokémon du village : au travail, au pré, sur les lanternes, dans le lac… et deux sauvages (Évoli, Fantominus la nuit).
const villagePokemon = createVillagePokemon(VILLAGE_POKEMON, Math.random)
/** Niveau de l'eau en un point : la crue là où elle est, sinon la rivière. */
const waterLevel = (x: number, z: number) => surfaceAt(flood, {x: Math.floor(x), y: Math.floor(z)}) ?? floodLevels(weather).river
const villagePokemonView = createVillagePokemonView(scene, villagePokemon, terrain.height, waterLevel, physics)

// Armes : Tab ouvre le menu, 1 à 3 choisissent, Espace frappe. Habitants et Pokémon du village peuvent être tués ;
// ils reviennent quelques heures de jeu plus tard (voir combat.ts). Pikachu et les rencontres scriptées sont épargnés.
const life = createLife()
const police = createPolice()
const mountedPolice = createMountedPoliceView(scene, terrain.height)
let prison: PrisonState | null = null
let prisonView: ReturnType<typeof createPrisonView> | null = null
let guardDuel: GuardDuel | null = null
let challengedOfficer: number | null = null
const guardDuelView = createGuardDuelView()
const PRISON_FRAMING: CameraFraming = {offset: new THREE.Vector3(0, 5, 5), lookHeight: 0.8, lookAhead: 0}
let prisonFrom = new THREE.Vector3(), prisonTo = new THREE.Vector3(), prisonStepAt = 0
let prisonDirection: Direction = 'right'
const arrestOverlay = createArrestOverlay({
    onPause: () => {
        stopWalking()
        pendingStrike = null
        rig.setActive(false)
        villageAudio.setActive(false)
        renderer.setAnimationLoop(null)
    },
    onRelease: () => {
        enterPrison(true)
        resumeDetentionScene()
    },
    onResist: () => {startResistance(); resumeDetentionScene()},
})
let weapon: WeaponId = 'fists'
const weaponView = createWeaponView(scene, trainer)
const weaponMenu = createWeaponMenu((picked) => {
    weapon = picked
    lastHud = ''
})
const ATTACK_GAIT: Record<WeaponId, AttackGait> = {fists: 'punch', sword: 'slash', bow: 'shoot'}
/** Prochain coup permis, fin de l'animation du coup en cours, et coup en attente de son impact. */
let nextAttack = 0, attackUntil = 0
let pendingStrike: { at: number; weapon: WeaponId } | null = null
let combatNote: { text: string; until: number } | null = null
const HEALTH = {villager: 40, child: 25, pokemon: 30, ronflex: 120} as const

/** Êtres vivants qu'on peut frapper, en cases (centre de case), avec leur santé maximale. */
function combatTargets(): Target[] {
    if (duelActive()) return [guardDuel!.opponent]
    if (prison) return []
    const targets: Target[] = []
    for (const villager of villagers) {
        if (villager.inside || villager.down) continue
        const at = positionOf(villager)
        targets.push({id: villager.profile.id, kind: 'villager', name: villager.profile.name, x: at.x + 0.5, y: at.y + 0.5,
            maxHealth: villager.profile.child ? HEALTH.child : HEALTH.villager})
    }
    for (const pokemon of villagePokemon) {
        if (!pokemon.visible || pokemon.down) continue
        const at = pokemonPosition(pokemon)
        targets.push({id: pokemon.profile.id, kind: 'pokemon', name: pokemon.profile.name, x: at.x + 0.5, y: at.y + 0.5,
            maxHealth: pokemon.profile.species === 'ronflex' ? HEALTH.ronflex : HEALTH.pokemon})
    }
    return targets
}

/** Espace : lance le coup de l'arme tenue ; l'impact est résolu un peu plus tard, quand la lame ou la flèche arrive. */
function attack(now: number) {
    if (now < nextAttack || castle.active || bike || isFishing(fishing) || landedCatch || encounterOverlay.isOpen) return
    if (prison && !duelActive()) return
    const chosen = weaponById(weapon)
    nextAttack = now + chosen.cooldown * 1000
    attackUntil = now + chosen.cooldown * 1000
    trainer.attack(ATTACK_GAIT[weapon])
    pendingStrike = {at: now + chosen.impact * 1000, weapon}
}

const impactPoint = new THREE.Vector3()
/** Force du coup mortel sur le corps (N·s) : la flèche projette, le poing renverse à peine. */
const IMPACT_IMPULSE: Record<WeaponId, number> = {fists: 45, sword: 80, bow: 110}
function resolveStrike(now: number) {
    if (!pendingStrike || now < pendingStrike.at) return
    const chosen = weaponById(pendingStrike.weapon)
    pendingStrike = null
    // Le dresseur frappe droit devant lui (rotation 0 : vers le sud, +y en cases).
    const heading = {x: Math.sin(trainer.rotation.y), y: Math.cos(trainer.rotation.y)}
    const origin = {x: trainer.position.x, y: trainer.position.z}
    const targetLife = duelActive() ? guardDuel!.life : life
    const target = aimAt(targetLife, chosen, origin, heading, combatTargets())
    if (!target) {
        if (chosen.id === 'bow') {
            weaponView.shoot(impactPoint.set(origin.x + heading.x * chosen.range, trainer.position.y + 1, origin.y + heading.y * chosen.range))
        }
        return
    }
    if (target.kind === 'guard') {
        const blocked = prison ? (tile: Position) => !prisonPassable(prison!, tile)
            : (tile: Position) => !walkable(tile) || castleBlocks(tile)
        // La même ligne de visée que le garde empêche de tirer à travers les barreaux et les maisons.
        if (!hasClearDuelSight(origin, target, blocked)) return
        const hit = strike(targetLife, chosen, target)
        if (!hit) return
        guardWasHit(guardDuel!)
        impactPoint.set(target.x, prison ? 1 : terrain.height(target.x, target.y) + 1, target.y)
        if (chosen.id === 'bow') weaponView.shoot(impactPoint)
        weaponView.burst(impactPoint, false)
        combatNote = {text: `${target.name} : −${hit.damage} PV (${hit.health}/${target.maxHealth})`, until: now + 2000}
        return
    }
    const hit = strike(life, chosen, target)!
    reportKilling(police, hit, player.position)
    // Une lame frappe à une hauteur et d'un côté variables : c'est ce qui décide du membre tranché (voir pickSeveredLimb).
    const human = target.kind === 'villager'
    const side = (Math.random() - 0.5) * (chosen.id === 'sword' ? 0.5 : 0.1)
    const height = human ? (chosen.id === 'sword' ? 0.35 + Math.random() * 1.2 : 1.1) : 0.2 + Math.random() * 0.4
    impactPoint.set(target.x - heading.y * side, terrain.height(target.x, target.y) + height, target.y + heading.x * side)
    if (chosen.id === 'bow') weaponView.shoot(impactPoint)
    weaponView.burst(impactPoint, hit.killed)
    const push = new THREE.Vector3(heading.x, 0.3, heading.y).normalize()
    gore.splash(impactPoint, push, hit.killed ? 18 : 8)
    const blow: KillingBlow = {point: impactPoint.clone(), impulse: push.multiplyScalar(IMPACT_IMPULSE[chosen.id]), cuts: chosen.id === 'sword'}
    let wound: THREE.Object3D | null = null
    if (human) {
        const villager = villagers.find((candidate) => candidate.profile.id === target.id)!
        if (hit.killed) {
            // Il tombe sur la case la plus proche de sa position : plus de pas en cours, plus de case réservée.
            if (villager.next && villager.step > 0.5) villager.tile = villager.next
            Object.assign(villager, {down: true, next: null, step: 0, path: [], pose: 'dead', talking: 0, stagger: 0})
            wound = villagerView.kill(villager, blow).stump
        } else villager.stagger = 0.6
    } else {
        const pokemon = villagePokemon.find((candidate) => candidate.profile.id === target.id)!
        if (hit.killed) {
            if (pokemon.next && pokemon.step > 0.5) pokemon.tile = pokemon.next
            wound = villagePokemonView.kill(pokemon, blow)
            // Sans figurine à l'écran, un oiseau abattu est posé au sol ; la chute physique, elle, part de sa pose réelle.
            Object.assign(pokemon, {down: true, next: null, step: 0, path: [], flight: null, height: 0, visible: true, stagger: 0})
        } else pokemon.stagger = 0.5
    }
    if (wound) gore.spurt(wound)
    if (hit.killed) gore.pool(target.x, target.y, human ? 0.9 : 0.5)
    combatNote = {
        text: hit.killed ? `${target.name} est ${target.kind === 'villager' ? 'mort' : 'tué'}.` : `${target.name} : −${hit.damage} PV (${hit.health}/${target.maxHealth})`,
        until: now + 2500,
    }
    lastHud = ''
}

/** Les morts reviennent : les habitants depuis chez eux, les Pokémon là où ils sont tombés. */
function reviveFallen(hours: number) {
    for (const id of passTime(life, hours)) {
        const villager = villagers.find((candidate) => candidate.profile.id === id)
        if (villager) {
            const {home} = villager.profile
            Object.assign(villager, {down: false, inside: true, tile: {x: home.x, y: home.y}, next: null, path: [], pose: 'idle'})
            continue
        }
        const pokemon = villagePokemon.find((candidate) => candidate.profile.id === id)
        if (pokemon) Object.assign(pokemon, {down: false, visible: pokemon.profile.behaviour !== 'swim'})
    }
}

function duelActive(): boolean {
    return !!guardDuel && !guardDuel.result && (!prison || (prison.detained && prison.cellOpen))
}

function hasClearDuelSight(origin: Position, target: Position, blocked: (position: Position) => boolean) {
    return hasPoliceSight({x: origin.x - 0.5, y: origin.y - 0.5}, {x: target.x - 0.5, y: target.y - 0.5}, blocked)
}

function resumeDetentionScene() {
    rig.setActive(true)
    villageAudio.setActive(!prison)
    clock.getDelta()
    renderer.setAnimationLoop(animate)
}

function startResistance() {
    ride(false)
    const selected = [...police.officers].sort((a, b) => {
        const pa = officerPosition(a), pb = officerPosition(b)
        return Math.hypot(pa.x + 0.5 - trainer.position.x, pa.y + 0.5 - trainer.position.z)
            - Math.hypot(pb.x + 0.5 - trainer.position.x, pb.y + 0.5 - trainer.position.z)
    })[0]
    if (!selected) return
    challengedOfficer = selected.id
    const at = officerPosition(selected)
    guardDuel = createGuardDuel('police', {x: at.x + 0.5, y: at.y + 0.5})
    trainer.rotation.y = Math.atan2(guardDuel.opponent.x - trainer.position.x, guardDuel.opponent.y - trainer.position.z)
    stopWalking()
    pendingStrike = null
    combatNote = {text: 'Duel contre la garde : Espace pour frapper, 1 / 2 / 3 pour choisir une arme. Recule pour esquiver.', until: performance.now() + 6000}
}

/** Une détention possède son propre état local ; la progression et les PV Pokémon ne changent pas. */
function enterPrison(detained: boolean) {
    const now = performance.now()
    if (detained) finishArrest(police)
    ride(false)
    stopWalking()
    pendingStrike = null
    attackUntil = 0
    nextAttack = now + 1000
    weapon = 'fists'
    weaponMenu.close()
    Object.assign(fishing, createFishing())
    landedCatch = null
    fishHeld = fishPressed = false
    prison = createPrison(detained)
    prisonView ??= createPrisonView(renderer, camera)
    prisonView.scene.add(trainer)
    weaponView.setScene(prisonView.scene)
    prisonFrom = prisonTo = tileCenter(prison.position.x, prison.position.y)
    prisonStepAt = now - STEP_DURATION
    prisonDirection = 'right'
    trainer.position.copy(prisonTo)
    guardDuel = createGuardDuel('warden', {x: WARDEN_SPAWN.x + 0.5, y: WARDEN_SPAWN.y + 0.5})
    guardDuel.heading = -Math.PI / 2
    challengedOfficer = null
    villageAudio.setActive(false)
    renderer.toneMappingExposure = 1
    rig.snap(trainer.position, PRISON_FRAMING)
    combatNote = null
    mountedPolice.update(police, 0, false)
    lastHud = ''
}

function leavePrison() {
    const escaped = prison!.detained
    stopWalking()
    pendingStrike = null
    prison = null
    guardDuel = null
    guardDuelView.root.removeFromParent()
    scene.add(trainer)
    weaponView.setScene(scene)
    const position = {...PRISON_ENTRANCE}
    player = {...player, travelMode: 'walking', position, direction: 'down'}
    from = to = tileCenter(position.x, position.y)
    followerFrom = followerTo = tileCenter(position.x, position.y - 1)
    stepStart = performance.now() - STEP_DURATION
    trainer.position.copy(to)
    trainer.position.y = terrain.tile(position)
    renderer.toneMappingExposure = OUTDOOR_EXPOSURE
    rig.snap(trainer.position, outdoorFraming())
    villageAudio.setActive(true)
    if (escaped) resumeAfterResistance(police, position, null)
    combatNote = {text: escaped ? 'Tu as ouvert la prison avec les clés du geôlier. La garde est alertée !' : 'Tu quittes la prison.', until: performance.now() + 6000}
    lastHud = ''
}

function interactWithPrison() {
    if (!prison) return
    const event = interactPrison(prison)
    if (event === 'exit') return leavePrison()
    if (event === 'challenge') combatNote = {text: 'Le geôlier ouvre la cellule et te défie. Espace : attaquer. 1 / 2 / 3 : arme.', until: performance.now() + 5000}
    if (event === 'keys') combatNote = {text: 'Clés du geôlier récupérées. Rejoins la porte au nord-est et appuie sur E.', until: performance.now() + 6000}
    lastHud = ''
}

function updateDuelEncounter(delta: number, now: number) {
    if (duelActive()) {
        const duel = guardDuel!
        for (const event of updateGuardDuel(duel, delta, {
            player: {x: trainer.position.x, y: trainer.position.z},
            passable: prison ? (tile) => prisonPassable(prison!, tile) : (tile) => walkable(tile) && !castleBlocks(tile),
            blocksSight: prison ? (tile) => !prisonPassable(prison!, tile) : (tile) => !walkable(tile) || castleBlocks(tile),
        })) {
            if (event.type === 'lost') {
                enterPrison(true)
                combatNote = {text: 'Duel perdu. La garde te reconduit en cellule. Approche des barreaux pour défier le geôlier.', until: now + 7000}
                break
            }
            if (event.type === 'won' || event.type === 'fled') {
                pendingStrike = null
                if (duel.kind === 'warden') {
                    defeatWarden(prison!, duel.opponent)
                    combatNote = {text: 'Geôlier vaincu. Approche de ses clés et appuie sur E.', until: now + 6000}
                } else {
                    resumeAfterResistance(police, player.position, event.type === 'won' ? challengedOfficer : null)
                    guardDuel = null
                    challengedOfficer = null
                    combatNote = {text: event.type === 'won' ? 'Garde vaincu. Fuis avant les renforts !' : 'Tu romps le duel. La garde reprend la poursuite.', until: now + 5000}
                }
            }
        }
    }
    guardDuelView.update(guardDuel, delta, prison ? prisonView!.scene : scene, prison ? () => 0 : terrain.height)
}

function duelHud(): string {
    if (!duelActive()) return ''
    const duel = guardDuel!
    return `<p class="world3d-wanted"><b>Duel · ${duel.opponent.name}</b><br>Toi : ${duelHealth(duel, 'player')}/100 PV · ${duel.opponent.name} : ${duelHealth(duel, 'opponent')}/80 PV`
        + `<br>${duel.windup > 0 ? '⚔ Le garde prépare son coup : recule !' : 'Espace : frapper · 1 / 2 / 3 : arme · déplace-toi pour esquiver'}</p>`
}

function updateVillagePolice(delta: number, now: number) {
    for (const event of updatePolice(police, document.hidden ? 0 : delta, {
        player: {x: trainer.position.x - 0.5, y: trainer.position.z - 0.5}, onLand: player.travelMode === 'walking',
        playerMoving: bike ? Math.abs(bike.speed) > 0.3 : now - stepStart < STEP_DURATION,
        passable: (tile) => walkable(tile) && !castleBlocks(tile),
        blocksSight: (tile) => { const kind = tileAt(WORLD_MAP, tile); return kind === null || kind === 'wall' || kind === 'tree' || castleBlocks(tile) },
        occupied: (tile) => !!villagerAt(villagers, tile) || !!pokemonAt(villagePokemon, tile),
    })) {
        if (event.type === 'arrested') arrestOverlay.open()
        else {combatNote = {text: 'Tu as semé la garde montée. La recherche est levée.', until: now + 5000}; lastHud = ''}
    }
    mountedPolice.update(guardDuel?.kind === 'police' ? {...police, officers: police.officers.filter((officer) => officer.id !== challengedOfficer)} : police, delta, true)
}
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
    const actors = [...villagerView.roots(), ...villagePokemonView.roots(), ...mountedPolice.roots()].filter((root) => !nearShore(root.position.x, root.position.z))
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

// Pêche : F lance, ferre, puis mouline (maintenu) ; la prise ouvre un combat, et la victoire la capture.
const fishing = createFishing()
const fishingView = createFishingView(scene, trainer)
let fishHeld = false, fishPressed = false
/** Événements nés hors de la boucle d'image (le lancer, au clavier), joués à l'image suivante. */
const fishingQueue: FishingEvent[] = []
let fishingNote: { text: string; until: number } | null = null
/** Prise suspendue au bout du fil, avant d'ouvrir le combat. */
let landedCatch: { speciesKey: string; name: string; weight: number; at: number } | null = null
/** Eau d'une case pour la pêche : le lac, la rivière, ou un champ assez noyé pour qu'un poisson s'y aventure. */
function fishingWater({x, z}: { x: number; z: number }): WaterKind | null {
    const tile = {x: Math.floor(x), y: Math.floor(z)}
    if (tileAt(WORLD_MAP, tile) === 'water') return zoneAt(tile) === 'Lac azur' ? 'lake' : 'river'
    return depthAt(flood, tile) > 0.3 ? 'flood' : null
}
/** Il y a de l'eau à portée de lancer devant le dresseur. */
function waterAhead() {
    const [dx, dz] = VECTORS[player.direction]
    return castDistance({x: player.position.x + 0.5, z: player.position.y + 0.5}, {x: dx, z: dz}, fishingWater) !== null
}
const FISHING_NOTES: Partial<Record<FishingEvent['type'], string>> = {
    missed: 'Le flotteur retombe sur la berge. Vise l’eau.',
    tooFar: 'Trop loin du flotteur : tu ramènes la ligne.',
    spat: 'Raté… le poisson a recraché l’appât. Le flotteur remonte.',
    snap: 'Clac ! Le fil a cassé : il fallait relâcher quand la jauge rougissait.',
    unhooked: 'Le fil est resté mou : le poisson s’est décroché.',
}
function handleFishing(events: FishingEvent[], now: number) {
    for (const event of events) {
        const note = event.type === 'hooked' ? `Ferré ! Ça tire… un ${event.fish.name} ?`
            : event.type === 'landed' ? `${event.fish.name} de ${event.weight.toLocaleString('fr-FR')} kg sorti de l’eau !`
            : FISHING_NOTES[event.type]
        if (note) fishingNote = {text: note, until: now + 4000}
        if (event.type === 'landed') {
            landedCatch = {speciesKey: event.fish.speciesKey, name: event.fish.name, weight: event.weight, at: now + 1600}
            fishingView.showCatch(event.fish, event.weight)
        }
        lastHud = ''
    }
    if (!landedCatch || now < landedCatch.at || encounterOverlay.isOpen) return
    const {speciesKey, name, weight} = landedCatch
    landedCatch = null
    fishingView.showCatch(null)
    encounterOverlay.open({id: `${speciesKey}-${Date.now()}`, speciesKey, position: {...player.position}}, {
        title: `Un ${name} de ${weight.toLocaleString('fr-FR')} kg au bout de la ligne !`,
        victoryText: `${name} est capturé !`,
        onVictory: () => {
            if (!captured.includes(speciesKey)) captured = [...captured, speciesKey]
            persist()
        },
    })
}
const clouds = createCloudCover()
scene.add(clouds)
const DAY = {scene, clouds, sun, sunDirection, sky, hemisphere, lanterns: lanternGlass, viewDistance: quality.viewDistance}

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
    if (prison) return
    // À vélo, le déplacement est libre : voir rideBicycle.
    if (encounterOverlay.isOpen || challenging || !held || bike) return
    // Les touches sont relatives à la vue (caméra libre, vue de dos ou regard FPS).
    const direction = rig.direction(held)
    // Dans le château, la marche est continue : voir walkInCastle, appelée à chaque image.
    if (castle.active) return
    if (now - stepStart < STEP_DURATION) return
    const previous = player.position
    const position = nextPosition(WORLD_MAP, previous, direction, player.travelMode)
    // Le château n'est pas sur la carte 2D : ses murs bloquent, sa grande porte fait entrer.
    // Un habitant sur la case : le dresseur se tourne vers lui sans avancer.
    if (player.travelMode === 'walking' && (villagerAt(villagers, position) || pokemonAt(villagePokemon, position) || policeAt(police, position))) {
        player = {...player, direction}
        return
    }
    if (duelActive() && Math.floor(guardDuel!.opponent.x) === position.x && Math.floor(guardDuel!.opponent.y) === position.y) {
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
    if (prison || duelActive()) return
    ride(false)
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
    if (encounterOverlay.isOpen || villageMap.isOpen || arrestOverlay.isOpen || challenging || event.ctrlKey || event.metaKey || event.altKey) return
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
        rig.cycle(prison ? prisonDirection : castle.state?.facing ?? player.direction)
        lastHud = ''
        return
    }
    if (key === 'tab' && !castle.active) {
        event.preventDefault()
        if (!event.repeat) weaponMenu.toggle()
        return
    }
    if (!castle.active && !event.repeat && weaponMenu.pickByKey(key)) {
        event.preventDefault()
        return
    }
    if (key === 'escape' && weaponMenu.isOpen) {
        weaponMenu.close()
        return
    }
    if (key === ' ' && !castle.active) {
        // Espace ne fait pas défiler la page ; maintenu, il enchaîne les coups au rythme de l'arme.
        event.preventDefault()
        attack(performance.now())
        return
    }
    if (key === 'b' && !event.repeat && !castle.active) {
        event.preventDefault()
        if (prison) return
        if (player.travelMode === 'walking' && !isFishing(fishing) && !landedCatch) ride(!bike)
        return
    }
    if (key === 'f' && !castle.active) {
        event.preventDefault()
        if (prison || duelActive()) return
        if (event.repeat) return
        fishHeld = fishPressed = true
        if (!isFishing(fishing) && !landedCatch) {
            ride(false)
            const [dx, dz] = VECTORS[player.direction]
            const origin = {x: trainer.position.x, z: trainer.position.z}, heading = {x: dx, z: dz}
            const distance = castDistance(origin, heading, fishingWater)
            if (distance === null) fishingNote = {text: 'Pas d’eau à portée devant toi.', until: performance.now() + 2500}
            else {
                stopWalking()
                fishingQueue.push(...castLine(fishing, origin, heading, distance))
            }
            lastHud = ''
        }
        return
    }
    if (key === 'escape' && isFishing(fishing)) {
        reelIn(fishing)
        lastHud = ''
        return
    }
    if (key === 'e') {
        if (event.repeat) return

        event.preventDefault()
        stopWalking()
        if (prison) return interactWithPrison()
        if (duelActive()) return
        if (castle.active) return interactInCastle(performance.now())
        if (Math.hypot(player.position.x - PRISON_ENTRANCE.x, player.position.y - PRISON_ENTRANCE.y) <= 1.5) return enterPrison(false)
        // Parler, combattre ou embarquer : on descend d'abord du vélo.
        ride(false)
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
    // Marcher pendant le vol du flotteur ramène la ligne ; une fois à l'eau, le fil suit le dresseur (voir moveAngler).
    if (fishing.phase === 'casting') {
        reelIn(fishing)
        lastHud = ''
    }
    // La répétition automatique d'une touche dont le pas a été interrompu (escalier, combat) ne relance pas la marche.
    if (event.repeat && !pressed.has(direction)) return
    // Nouvelle touche : le repère de la vue est figé jusqu'à ce qu'elles soient toutes relâchées.
    if (direction !== held) rig.press()
    held = direction
    pressed.add(direction)
})
addEventListener('keyup', (event) => {
    if (event.key.toLowerCase() === 'f') fishHeld = false
    const direction = KEYS[event.key.toLowerCase()]
    if (!direction) return
    pressed.delete(direction)
    if (direction !== held) return
    // Dehors, la dernière touche encore enfoncée reprend la main.
    held = [...pressed].at(-1) ?? null
    if (!held) rig.release()
})
addEventListener('blur', () => {
    stopWalking()
    fishHeld = false
})

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
    else { villageAudio.dispose(); villageAudioControls.dispose(); mountedPolice.dispose(); arrestOverlay.dispose() }
})
addEventListener('pageshow', () => villageAudio.setHidden(document.hidden))
addEventListener('wheel', (event) => {
    if (encounterOverlay.isOpen || villageMap.isOpen || arrestOverlay.isOpen) return
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
    canOpen: () => !encounterOverlay.isOpen && !arrestOverlay.isOpen && !prison && !duelActive() && !challenging,
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
    if (prison) {
        const hint = prisonInteraction(prison)
        const instruction = hint === 'challenge' ? 'E : appeler et défier le geôlier'
            : hint === 'keys' ? 'E : récupérer les clés du geôlier' : hint === 'exit' ? 'E : ouvrir la porte et sortir'
            : !prison.cellOpen ? 'Approche des barreaux à l’est pour appeler le geôlier.'
            : prison.guardDefeated && !prison.hasKeys ? 'Approche des clés brillantes et appuie sur E.'
            : prison.hasKeys || !prison.detained ? 'La sortie est au nord-est.' : 'Affronte le geôlier pour récupérer ses clés.'
        hud.innerHTML = `<strong>Prison de Clairbois · ${prison.detained ? 'Détention' : 'Visite'}</strong>` + duelHud()
            + `<p>${instruction}</p><p>${prison.hasKeys ? '🔑 Clés du geôlier récupérées' : '🔒 Sortie verrouillée pour les détenus'}</p>`
            + (combatNote && now < combatNote.until ? `<p>${combatNote.text}</p>` : '')
            + `<p>Arme : ${weaponById(weapon).name} · Espace : frapper · 1 / 2 / 3 : arme</p><p>Flèches / ZQSD · ${viewHelp()}</p>`
        return
    }
    const wanted = describePolice(police)
    const policeLine = duelActive() ? duelHud() : wanted ? `<p class="world3d-wanted"><b>Garde montée</b><br>${wanted}</p>` : ''
    if (castle.active) {
        const text = castle.hud(now, `${viewHelp()} · M : ${castleAudio.muted ? 'remettre' : 'couper'} le son`) + policeLine + performanceLine()
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
    const neighbour = player.travelMode === 'walking' ? villagers.find((villager) => !villager.inside && !villager.down && !villager.next
        && Math.abs(villager.tile.x - player.position.x) + Math.abs(villager.tile.y - player.position.y) === 1) : undefined
    const beast = player.travelMode === 'walking' ? pokemonNear(villagePokemon, player.position) : undefined
    const time = formatHour(Math.floor(hour * 4) / 4)
    const sky = describeWeather(weather)
    const wading = now - wadeBlocked < 2500
    if (fishingNote && now > fishingNote.until) fishingNote = null
    const angling = describeFishing(fishing)
    const fishHint = !angling && !landedCatch && !castle.active && waterAhead()
    if (combatNote && now > combatNote.until) combatNote = null
    const team = ['Pikachu', ...captured.map((key) => key === 'mewtwo' ? 'Mewtwo' : FISH[key]?.name ?? key)]
    const text = `${zoneAt(player.position)}|${landmark?.name}|${boatAction}|${loading}|${exit}|${nearCharmander}|${captured}|${time}|${dialogue?.text}|${neighbour?.profile.id}|${beast?.profile.id}|${sky}|${wading}|${angling}|${fishingNote?.text}|${fishHint}|${bike !== null}|${weapon}|${combatNote?.text}|${policeLine}|${performanceLine()}`
    if (text === lastHud) return
    lastHud = text
    hud.innerHTML = `<strong>${zoneAt(player.position)} · ${time}${sky ? ` · ${sky}` : ''}</strong>`
        + policeLine
        + (angling ? `<p class="world3d-dialogue"><b>Pêche</b> — ${angling}</p>` : '')
        + (fishingNote ? `<p><b>Pêche</b> — ${fishingNote.text}</p>` : '')
        + (fishHint ? '<p>F : lancer la ligne</p>' : '')
        + (combatNote ? `<p class="world3d-dialogue"><b>Combat</b> — ${combatNote.text}</p>` : '')
        + (wading ? `<p>L’eau est trop profonde pour passer à pied (plus de ${Math.round(WADE * 100)} cm).</p>` : '')
        + (dialogue ? `<p class="world3d-dialogue"><b>${dialogue.name}</b> <i>(${dialogue.job})</i> — ${dialogue.text}</p>` : '')
        + (!dialogue && neighbour ? `<p>E : parler à ${neighbour.profile.name} <i>(${neighbour.profile.job})</i></p>` : '')
        + (!dialogue && beast ? `<p>E : ${beast.profile.wild ? `combattre ${beast.profile.name} <i>(sauvage)</i>` : `observer ${beast.profile.name}`}</p>` : '')
        + (landmark ? `<p><b>${landmark.name}</b> — ${landmark.message}</p>` : '')
        + (loading < 100 ? `<p>Chargement du monde… ${loading} %</p>` : '')
        + (exit ? '<p><b>Sortie est</b> — continue vers l’est pour rejoindre le monde ouvert.</p>' : '')
        + (nearCharmander ? '<p><b>Salamèche</b> — E : ouvrir le combat</p>' : '')
        + (Math.hypot(player.position.x - PRISON_ENTRANCE.x, player.position.y - PRISON_ENTRANCE.y) <= 1.5 ? '<p>E : entrer dans la prison de Clairbois</p>' : '')
        + (boatAction ? `<p>E : ${boatAction === 'board' ? 'embarquer' : 'débarquer'}</p>` : '')
        + (captured.length ? `<p>Équipe : ${team.join(', ')}</p>` : '')
        + performanceLine()
        + (player.travelMode === 'walking' ? `<p>B : ${bike ? 'descendre du vélo' : 'monter à vélo'}</p>` : '')
        + (bike ? '' : `<p>Arme : ${weaponById(weapon).name} · Espace : frapper · Tab : changer d’arme</p>`)
        + `<p class="world3d-help">${bike ? '↑ pédaler · ↓ freiner, puis reculer · ← → tourner' : 'Flèches / ZQSD pour marcher'} · ${viewHelp()} · <a href="/">carte 2D</a> · <a href="/open-world.html">monde ouvert</a></p>`
        + MAP_BUTTON + NEW_GAME
}

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
    post.setSize(innerWidth, innerHeight)
    castle.setSize(innerWidth, innerHeight)
})

const resolution = createResolutionScaler(renderer, quality.maxPixelRatio, undefined, (ratio) => {
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
if (import.meta.env.DEV) void Promise.all([import('./devPanel'), import('./propEditor')]).then(([{createDevPanel}, {createPropEditor}]) => {
    const editor = createPropEditor({
        scene, camera, canvas: renderer.domElement, map: WORLD_MAP, props: villageProps, ground: terrain.height,
        refresh: (tile) => streamer.refresh(tile), setCameraActive: (active) => rig.setActive(active),
    })
    Object.assign((window as unknown as { world3d: object }).world3d, {editor})
    createDevPanel({
        renderer, scene, sun, weather, cameraOffset: CAMERA_OFFSET, framing: OUTDOOR_FRAMING, resolution, editor,
        frameStats: () => ({cpu: cpuMilliseconds, gpu: gpuTimer?.milliseconds() ?? null}),
        hour: {get: () => hour, set: (value) => { hour = value }},
        zoom: {get: () => zoom, set: (value) => { zoom = value }},
        rain: (hours, storm) => startRain(weather, hours, storm),
        simulate: (seconds) => {
            for (let time = 0; time < seconds; time += 1 / 30) stepFlood(flood, 1 / 30, floodLevels(weather))
        },
    })
})

const clock = new THREE.Clock()
let floodViewTime = 0
camera.position.copy(from).add(new THREE.Vector3(0, 7, 8))

// Mesure réservée au développement : en production, pas de requête GPU à chaque image.
const gpuTimer = import.meta.env.DEV ? createGpuTimer(renderer.getContext()) : null
/** Temps CPU d'une image (logique et envoi des commandes de rendu), lissé ; lu par le panneau de développement. */
let cpuMilliseconds = 0

function animate(now: number) {
    const start = performance.now()
    renderer.info.reset()
    gpuTimer?.begin()
    frame(now)
    gpuTimer?.end()
    cpuMilliseconds = cpuMilliseconds * 0.9 + (performance.now() - start) * 0.1
}

function frame(now: number) {
    const frameSeconds = clock.getDelta()
    measureFps(now, frameSeconds)
    const delta = Math.min(frameSeconds, 0.05)
    step(now)
    if (prison) {framePrison(delta, now); return}
    // Le village continue de vivre pendant qu'on explore le château.
    hour = advanceHour(hour, delta)
    updateWeather(weather, delta * 24 / DAY_SECONDS, Math.random)
    stepFlood(flood, delta, floodLevels(weather))
    followShores(now)
    updateVillagers(villagers, hour, delta, player.position, walkable, (tile) => pokemonAt(villagePokemon, tile) !== undefined || policeAt(police, tile), weather.rain > 0.45, 48)
    updateVillagePokemon(villagePokemon, hour, delta, {player: player.position, passable: (tile) => walkable(tile) && !policeAt(police, tile), villagers, random: Math.random, rain: weather.rain, pools, activityRadius: 48})
    if (castle.active) {
        mountedPolice.update(police, 0, false)
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
    rideBicycle(delta, now)
    if (castle.active) return
    const progress = Math.min(1, (now - stepStart) / STEP_DURATION)
    const onBoat = player.travelMode === 'boat'

    trainer.position.lerpVectors(from, to, progress)
    trainer.position.y = onBoat ? waterLevel(trainer.position.x, trainer.position.z) + 0.1 : terrain.height(trainer.position.x, trainer.position.z)
    updateVillagePolice(delta, now)
    // Petite marge après chaque pas : la marche ne se coupe pas entre deux cases enchaînées.
    const fishingNow = isFishing(fishing) || landedCatch !== null
    const walking = !onBoat && now - stepStart < STEP_DURATION + 60
    const guard: 'sword' | 'bow' | 'idle' = weapon === 'sword' ? 'sword' : weapon === 'bow' ? 'bow' : 'idle'
    trainer.animate(delta, bike ? 'ride' : now < attackUntil ? ATTACK_GAIT[weapon] : walking ? 'walk' : fishingNow ? 'fish' : guard)
    weaponView.hold(bike || fishingNow ? null : weapon)
    // Ligne à l'eau, le dresseur arrêté se tourne vers son flotteur (il a pu longer la berge entre-temps).
    const facingFloat = !walking && fishing.phase !== 'idle' && fishing.phase !== 'casting'
    const facing = duelActive() ? Math.atan2(guardDuel!.opponent.x - trainer.position.x, guardDuel!.opponent.y - trainer.position.z)
        : facingFloat ? Math.atan2(fishing.float.x - trainer.position.x, fishing.float.z - trainer.position.z) : ANGLES[player.direction]
    // Par le plus court chemin : sans cela, passer de -170° à 170° ferait faire un tour complet au dresseur.
    const yawStep = (THREE.MathUtils.euclideanModulo(facing - trainer.rotation.y + Math.PI, Math.PI * 2) - Math.PI) * 0.25
    if (bike) poseBicycle(delta)
    else trainer.rotation.y += yawStep
    boat.visible = onBoat
    boat.position.set(trainer.position.x, waterLevel(trainer.position.x, trainer.position.z) + Math.sin(now * 0.002) * 0.03, trainer.position.z)
    boat.rotation.y = trainer.rotation.y

    if (pikachu && bike) {
        // Dans le siège enfant, il suit chaque mouvement du vélo.
        bicycle.anchors.passenger.getWorldPosition(pikachu.root.position)
        pikachu.root.quaternion.copy(trainer.quaternion)
        pikachu.root.visible = true
    } else if (pikachu) {
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
    // À vélo, la caméra suit le cap réel (lacet de vue : 0 vers le nord, donc cap + π).
    rig.update(delta, trainer.position, bike ? bike.heading + Math.PI : player.direction, bike ? Math.abs(bike.speed) > 0.3 : held !== null, outdoorFraming())
    const phase = fishing.phase
    fishingQueue.push(...moveAngler(fishing, {x: trainer.position.x, z: trainer.position.z}))
    const fishingEvents = fishingQueue.splice(0)
    if (!encounterOverlay.isOpen) {
        fishingEvents.push(...updateFishing(fishing, delta, fishHeld, fishPressed, {waterAt: fishingWater, hour, rain: weather.rain, storm: weather.storm, random: Math.random}))
    }
    fishPressed = false
    if (fishing.phase !== phase) lastHud = ''
    handleFishing(fishingEvents, now)
    fishingView.update(fishing, delta, now / 1000, waterLevel, fishingEvents)
    villageAudio.update({listener: trainer.position, forward: camera.getWorldDirection(audioForward), villagers, pokemon: villagePokemon,
        extraPokemon: [
            ...(pikachu ? [{id: 'compagnon-pikachu', species: 'pikachu', x: pikachu.root.position.x - 0.5, y: pikachu.root.position.z - 0.5}] : []),
            {id: wildCharmander.id, species: wildCharmander.speciesKey, ...wildCharmander.position},
        ], rain: weather.rain})
    // Passants et Pokémon après la caméra : seuls ceux qu'elle voit sont dessinés et animés.
    camera.updateMatrixWorld()
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    resolveStrike(now)
    updateDuelEncounter(delta, now)
    if (prison) {updateHud(now); prisonView!.render(); return}
    reviveFallen(delta * 24 / DAY_SECONDS)
    weaponView.update(delta)
    physics.step(delta)
    gore.update(delta, now / 1000)
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

function framePrison(delta: number, now: number) {
    if (!prison) return
    if (held && now - prisonStepAt >= STEP_DURATION) {
        prisonDirection = rig.direction(held)
        const [dx, dy] = VECTORS[prisonDirection]
        const next = {x: prison.position.x + dx, y: prison.position.y + dy}
        const opponent = duelActive() ? guardDuel!.opponent : null
        const occupied = opponent && Math.floor(opponent.x) === next.x && Math.floor(opponent.y) === next.y
        if (prisonPassable(prison, next) && !occupied) {
            prisonFrom = prisonTo.clone(); prisonTo = tileCenter(next.x, next.y)
            prison.position = next; prisonStepAt = now
        }
    }
    trainer.position.lerpVectors(prisonFrom, prisonTo, Math.min(1, (now - prisonStepAt) / STEP_DURATION))
    trainer.rotation.y = duelActive() ? Math.atan2(guardDuel!.opponent.x - trainer.position.x, guardDuel!.opponent.y - trainer.position.z) : ANGLES[prisonDirection]
    trainer.animate(delta, now < attackUntil ? ATTACK_GAIT[weapon] : now - prisonStepAt < STEP_DURATION ? 'walk' : weapon === 'sword' ? 'sword' : weapon === 'bow' ? 'bow' : 'idle')
    weaponView.hold(weapon)
    resolveStrike(now)
    updateDuelEncounter(delta, now)
    weaponView.update(delta)
    prisonView!.update(prison!, now / 1000)
    trainer.visible = rig.mode !== 'fps'
    rig.update(delta, trainer.position, prisonDirection, held !== null, PRISON_FRAMING)
    updateHud(now)
    prisonView!.render()
}
