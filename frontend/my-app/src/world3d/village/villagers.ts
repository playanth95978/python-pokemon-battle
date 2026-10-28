/**
 * Les habitants de Clairbois et leur journée, sans rendu : chacun a une maison, un métier et un emploi du temps.
 * À chaque heure il rejoint le bon endroit par le plus court chemin, s'écarte des autres et du dresseur, puis
 * travaille, bavarde ou flâne d'un point à l'autre ; le soir, il rentre et disparaît derrière sa porte.
 */
import type { Direction, Position } from '../../world/types'
import { distance, findPath } from './pathfinding'
import { DISTRICT_VILLAGERS } from './districtLife'

export interface Spot extends Position { facing: Direction }
/** Ce que fait un habitant arrivé à destination ; le rendu en tire l'animation. */
export type Activity = 'sleep' | 'work' | 'hammer' | 'chat' | 'idle' | 'play'
export interface Shift {
    /** Heure de début (0 à 24) ; le créneau dure jusqu'au suivant, le dernier jusqu'au premier du lendemain. */
    from: number
    activity: Activity
    /** Un seul endroit, ou une tournée parcourue dans l'ordre (champs, ronde du garde, jeux des enfants). */
    spots: Spot[]
}
export interface Outfit { shirt: number; pants: number; hair: number; skin: number; accent: number }
export interface Profile {
    id: string
    name: string
    job: string
    /** Case devant la porte de sa maison. */
    home: Spot
    child?: true
    outfit: Outfit
    schedule: Shift[]
    lines: string[]
}

const spot = (x: number, y: number, facing: Direction): Spot => ({x, y, facing})
const DOORS = {
    depart: spot(12, 32, 'down'), soins: spot(24, 32, 'down'), atelier: spot(12, 43, 'down'), chapelle: spot(5, 32, 'down'),
    forge: spot(5, 40, 'down'), ferme: spot(5, 46, 'down'), garde: spot(22, 24, 'down'),
}
const sleep = (from: number): Shift => ({from, activity: 'sleep', spots: []})

export const VILLAGERS: Profile[] = [
    {
        id: 'aldric', name: 'Aldric', job: 'forgeron', home: DOORS.forge,
        outfit: {shirt: 0x5b4636, pants: 0x2f2a26, hair: 0x1d1410, skin: 0xb07a52, accent: 0x6b6b6b},
        schedule: [
            {from: 6, activity: 'hammer', spots: [spot(9, 37, 'left')]},
            {from: 12, activity: 'chat', spots: [spot(22, 41, 'left')]},
            {from: 13, activity: 'hammer', spots: [spot(9, 37, 'left')]},
            {from: 19, activity: 'idle', spots: [spot(22, 40, 'up')]},
            sleep(21),
        ],
        lines: ['Le fer se travaille tant qu’il est chaud, petit.', 'Mon Machoc porte les caisses plus vite que trois apprentis.', 'Une lame de Clairbois ne casse jamais.'],
    },
    {
        id: 'brunehilde', name: 'Brunehilde', job: 'marchande', home: DOORS.soins,
        outfit: {shirt: 0xb24a3a, pants: 0x5a3b2a, hair: 0x9c5a2a, skin: 0xe2b48c, accent: 0xe8d9b0},
        schedule: [
            {from: 7, activity: 'work', spots: [spot(19, 38, 'right')]},
            {from: 12, activity: 'chat', spots: [spot(25, 36, 'right')]},
            {from: 13, activity: 'work', spots: [spot(19, 38, 'right')]},
            {from: 19, activity: 'idle', spots: [spot(24, 40, 'up')]},
            sleep(21),
        ],
        lines: ['Pommes, baies Oran, baies Ceriz ! Tout est frais du matin !', 'Les Roucool me volent une pomme par jour. Une seule, ils sont polis.', 'Tu as l’air d’un dresseur. Les baies, ça requinque en combat !'],
    },
    {
        id: 'gaspard', name: 'Gaspard', job: 'drapier', home: DOORS.atelier,
        outfit: {shirt: 0x3f5a8a, pants: 0x2c3140, hair: 0x5a4a3a, skin: 0xd9a77e, accent: 0xc9a43c},
        schedule: [
            {from: 8, activity: 'work', spots: [spot(28, 40, 'left')]},
            {from: 12, activity: 'chat', spots: [spot(21, 41, 'right')]},
            {from: 13, activity: 'work', spots: [spot(28, 40, 'left')]},
            {from: 18, activity: 'chat', spots: [spot(25, 36, 'right')]},
            sleep(21),
        ],
        lines: ['De la laine de Wattouat : chaude l’hiver, et un peu électrique.', 'On raconte que le château cache un passage derrière la bibliothèque…', 'Une cape ? Pour toi, prix d’ami.'],
    },
    {
        id: 'margot', name: 'Margot', job: 'fermière', home: DOORS.ferme,
        outfit: {shirt: 0x7a8a3a, pants: 0x4a3a2a, hair: 0xd8b060, skin: 0xe8be96, accent: 0xf0e6d0},
        schedule: [
            {from: 5, activity: 'work', spots: [spot(10, 46, 'down'), spot(13, 48, 'down'), spot(15, 46, 'left')]},
            {from: 12, activity: 'idle', spots: [spot(12, 38, 'up')]},
            {from: 13, activity: 'work', spots: [spot(14, 48, 'down'), spot(11, 46, 'down')]},
            {from: 18, activity: 'work', spots: [spot(5, 50, 'down')]},
            sleep(20),
        ],
        lines: ['Le blé pousse bien cette année. Merci la pluie !', 'Mes Wattouat ne sortent pas de l’enclos… en principe.', 'Lève-toi avec le soleil et tu verras les Pokémon de la prairie.'],
    },
    {
        id: 'bertrand', name: 'Bertrand', job: 'garde', home: DOORS.garde,
        outfit: {shirt: 0x6e7680, pants: 0x30343a, hair: 0x2a2018, skin: 0xc48e66, accent: 0x8a2a2a},
        schedule: [
            {from: 6, activity: 'idle', spots: [spot(18, 25, 'up'), spot(16, 34, 'left'), spot(21, 37, 'right'), spot(18, 44, 'down'), spot(26, 34, 'right')]},
            sleep(22),
        ],
        lines: ['Halte ! Ah, c’est toi. Rien à signaler.', 'Le château au sud… n’y entre pas sans potions.', 'La nuit, des spectres rôdent près des remparts.'],
    },
    {
        id: 'iris', name: 'Sœur Iris', job: 'chapelaine', home: DOORS.chapelle,
        outfit: {shirt: 0xe8e2d4, pants: 0xe8e2d4, hair: 0x3a2a20, skin: 0xe6c0a0, accent: 0x6a5a8a},
        schedule: [
            {from: 7, activity: 'idle', spots: [spot(4, 32, 'down'), spot(7, 32, 'down')]},
            {from: 12, activity: 'chat', spots: [spot(26, 36, 'left')]},
            {from: 13, activity: 'idle', spots: [spot(4, 32, 'down'), spot(7, 32, 'down')]},
            sleep(20),
        ],
        lines: ['Que la lumière veille sur toi et tes Pokémon.', 'La cloche sonne à midi, puis au crépuscule.', 'Même un Fantominus mérite un peu de compassion.'],
    },
    {
        id: 'fernand', name: 'Fernand', job: 'ancien', home: DOORS.soins,
        outfit: {shirt: 0x6a5a4a, pants: 0x3a3a3a, hair: 0xd8d8d8, skin: 0xd0a07c, accent: 0x8a6a3a},
        schedule: [
            {from: 8, activity: 'idle', spots: [spot(25, 41, 'up')]},
            sleep(20),
        ],
        lines: ['De mon temps, Mewtwo n’habitait pas au château. C’était plus calme.', 'Assieds-toi un peu, la fontaine chante bien aujourd’hui.', 'Ronflex dort sous l’arbre depuis trois jours. Comme moi.'],
    },
    {
        id: 'rose', name: 'Rose', job: 'porteuse d’eau', home: DOORS.depart,
        outfit: {shirt: 0x4a8a8a, pants: 0x6a4a3a, hair: 0x6a2a1a, skin: 0xe8c0a0, accent: 0xf0f0e0},
        schedule: [
            {from: 7, activity: 'work', spots: [spot(12, 36, 'down'), spot(21, 38, 'left'), spot(9, 38, 'left')]},
            {from: 12, activity: 'idle', spots: [spot(23, 40, 'up')]},
            {from: 13, activity: 'work', spots: [spot(12, 36, 'down'), spot(9, 38, 'left')]},
            {from: 18, activity: 'chat', spots: [spot(26, 36, 'left')]},
            sleep(21),
        ],
        lines: ['Le puits est profond ; un Magicarpe y est tombé une fois.', 'Aldric boit plus d’eau que tout le village réuni.', 'Bonne journée, voyageur !'],
    },
    {
        id: 'colette', name: 'Colette', job: 'menuisière', home: DOORS.atelier,
        outfit: {shirt: 0x8a6a3a, pants: 0x3a4a5a, hair: 0x2a1a10, skin: 0x9a6a48, accent: 0xd0b080},
        schedule: [
            {from: 8, activity: 'work', spots: [spot(14, 43, 'up')]},
            {from: 12, activity: 'idle', spots: [spot(24, 40, 'up')]},
            {from: 13, activity: 'work', spots: [spot(14, 43, 'up')]},
            {from: 19, activity: 'idle', spots: [spot(23, 40, 'up')]},
            sleep(21),
        ],
        lines: ['Ces étals, c’est moi qui les ai montés. Solides, hein ?', 'Il me faudrait du bon chêne du bois des murmures.', 'Un banc neuf pour Fernand, et il ne bougera plus jamais.'],
    },
    {
        id: 'leo', name: 'Léo', job: 'enfant', home: DOORS.depart, child: true,
        outfit: {shirt: 0xd8a030, pants: 0x3a5a8a, hair: 0x5a3a1a, skin: 0xe8c0a0, accent: 0xd04040},
        schedule: [
            {from: 9, activity: 'play', spots: [spot(22, 37, 'right'), spot(25, 38, 'down'), spot(25, 40, 'left'), spot(22, 39, 'up')]},
            sleep(12),
            {from: 13, activity: 'play', spots: [spot(22, 37, 'right'), spot(25, 38, 'down'), spot(25, 40, 'left'), spot(22, 39, 'up')]},
            sleep(19),
        ],
        lines: ['Tu as un Pikachu ?! Il fait des éclairs ?', 'Chat perché ! … Tu joues pas ?', 'Quand je serai grand, j’attraperai un Mewtwo !'],
    },
    {
        id: 'lina', name: 'Lina', job: 'enfant', home: DOORS.depart, child: true,
        outfit: {shirt: 0xd06090, pants: 0x5a3a6a, hair: 0x2a1a10, skin: 0xd8a888, accent: 0xf0d040},
        schedule: [
            {from: 9, activity: 'play', spots: [spot(25, 40, 'left'), spot(22, 39, 'up'), spot(22, 37, 'right'), spot(25, 38, 'down')]},
            sleep(12),
            {from: 13, activity: 'play', spots: [spot(25, 40, 'left'), spot(22, 39, 'up'), spot(22, 37, 'right'), spot(25, 38, 'down')]},
            sleep(19),
        ],
        lines: ['Léo triche, il court trop vite !', 'Un jour j’aurai un Évoli. Il est trop mignon.', 'Maman dit qu’il faut rentrer avant les lanternes.'],
    },
    ...DISTRICT_VILLAGERS,
]

/** Cases par seconde, à la marche (adultes) et en courant (enfants qui jouent). */
export const WALK_SPEED = 1.6, RUN_SPEED = 3
/** Temps passé à chaque étape d'une tournée, en secondes de jeu réelles. */
export const DWELL = 8
/** Bloqué plus longtemps, l'habitant cherche un détour (ou passe à l'étape suivante si on occupe sa place). */
export const PATIENCE = 1.2
/** Durée d'une conversation avec le dresseur : l'habitant s'arrête et le regarde. */
export const TALK_SECONDS = 5

export type Pose = Activity | 'walk' | 'run'

export interface Villager {
    profile: Profile
    /** Case occupée, et case visée pendant un pas (réservée dès le départ du pas). */
    tile: Position
    next: Position | null
    /** Avancement du pas en cours, de 0 à 1. */
    step: number
    path: Position[]
    shift: Shift | null
    spotIndex: number
    dwell: number
    waiting: number
    facing: Direction
    pose: Pose
    /** Rentré chez lui : invisible et hors des collisions. */
    inside: boolean
    talking: number
}

const sortedSchedules = new WeakMap<Shift[], Shift[]>()
export function shiftAt(schedule: Shift[], hour: number): Shift {
    let sorted = sortedSchedules.get(schedule)
    if (!sorted) {
        sorted = [...schedule].sort((a, b) => a.from - b.from)
        sortedSchedules.set(schedule, sorted)
    }
    for (let index = sorted.length - 1; index >= 0; index--) if (sorted[index].from <= hour) return sorted[index]
    return sorted[sorted.length - 1]
}

/** Où va l'habitant pendant ce créneau : sa porte pour dormir, sinon l'étape de tournée en cours. */
export function goalOf(villager: Villager): Spot {
    const shift = villager.shift!
    return shift.activity === 'sleep' ? villager.profile.home : shift.spots[villager.spotIndex % shift.spots.length]
}

/** Au chargement, chacun est déjà à sa place de l'heure : personne ne traverse le village au démarrage. */
export function createVillagers(profiles: Profile[], hour: number): Villager[] {
    return profiles.map((profile) => {
        const shift = shiftAt(profile.schedule, hour)
        const villager: Villager = {
            profile, tile: {x: 0, y: 0}, next: null, step: 0, path: [], shift, spotIndex: 0, dwell: DWELL,
            waiting: 0, facing: 'down', pose: shift.activity, inside: shift.activity === 'sleep', talking: 0,
        }
        const goal = goalOf(villager)
        villager.tile = {x: goal.x, y: goal.y}
        villager.facing = goal.facing
        return villager
    })
}

const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y

/** Habitant visible sur cette case (ou en train d'y entrer) : le dresseur ne peut pas y aller. */
export function villagerAt(villagers: Villager[], tile: Position) {
    return villagers.find((villager) => !villager.inside && (same(villager.tile, tile) || (villager.next && same(villager.next, tile))))
}

/** Position continue (en cases) de l'habitant, au milieu de son pas. */
export function positionOf(villager: Villager): Position {
    if (!villager.next) return villager.tile
    return {
        x: villager.tile.x + (villager.next.x - villager.tile.x) * villager.step,
        y: villager.tile.y + (villager.next.y - villager.tile.y) * villager.step,
    }
}

function directionTo(from: Position, to: Position): Direction {
    const dx = to.x - from.x, dy = to.y - from.y
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left'
    return dy > 0 ? 'down' : 'up'
}

/**
 * Une image de vie du village. `passable` dit où l'on peut marcher (carte et château), `player` est la case du dresseur
 * et `blocked` les autres obstacles mobiles (Pokémon du village). Avec `shelter` (grosse pluie), chacun rentre chez
 * lui en courant, et ressort quand elle cesse.
 * Les habitants se réservent la case où ils entrent : deux personnes ne sont jamais sur la même case.
 */
export function updateVillagers(villagers: Villager[], hour: number, seconds: number, player: Position, passable: (tile: Position) => boolean,
                                blocked: (tile: Position) => boolean = () => false, shelter = false, activityRadius = Infinity) {
    const occupied = (tile: Position, self: Villager) => same(tile, player) || blocked(tile)
        || villagers.some((other) => other !== self && !other.inside && (same(other.tile, tile) || (other.next !== null && same(other.next, tile))))
    for (const villager of villagers) {
        const shift = shiftAt(villager.profile.schedule, hour)
        if (shift !== villager.shift) {
            villager.shift = shift
            villager.spotIndex = 0
            villager.path = []
            villager.dwell = DWELL
        }
        const resting = shift.activity === 'sleep' || shelter
        // Hors de la bulle visible, seul l'emploi du temps est resynchronisé : ni A*, ni déplacement image par image.
        // Le rendez-vous ne peut pas apparaître à portée du joueur ; les collisions restent réservées normalement.
        if (distance(villager.tile, player) > activityRadius && villager.talking <= 0) {
            const goal = resting ? villager.profile.home : goalOf(villager)
            if (distance(goal, player) > activityRadius && (resting || !occupied(goal, villager))) {
                villager.tile = {x: goal.x, y: goal.y}
                villager.next = null
                villager.path = []
                villager.step = 0
                villager.pose = resting ? 'sleep' : shift.activity
                villager.facing = goal.facing
                villager.inside = resting
            }
            continue
        }
        // Au réveil (ou après l'averse), il sort de chez lui, s'il a la place.
        if (villager.inside && !resting && !occupied(villager.profile.home, villager)) {
            villager.inside = false
            villager.tile = {x: villager.profile.home.x, y: villager.profile.home.y}
            villager.path = []
        }
        if (villager.inside) continue
        if (villager.talking > 0) villager.talking -= seconds
        if (villager.next) {
            const speed = villager.pose === 'run' ? RUN_SPEED : WALK_SPEED
            villager.step += seconds * speed
            if (villager.step < 1) continue
            villager.tile = villager.next
            villager.next = null
            villager.step = 0
        }
        // En pleine conversation, il finit son pas puis reste tourné vers le dresseur.
        if (villager.talking > 0) {
            villager.pose = 'idle'
            continue
        }
        const goal = resting ? villager.profile.home : goalOf(villager)
        if (same(villager.tile, goal)) {
            villager.path = []
            villager.waiting = 0
            if (resting) {
                villager.inside = true
                continue
            }
            villager.pose = shift.activity
            villager.facing = goal.facing
            villager.dwell -= seconds
            if (villager.dwell <= 0 && shift.spots.length > 1) {
                villager.spotIndex++
                villager.dwell = DWELL * (shift.activity === 'play' ? 0.3 : 1)
            }
            continue
        }
        const last = villager.path[villager.path.length - 1]
        if (!last || !same(last, goal)) villager.path = findPath(villager.tile, goal, passable) ?? []
        const next = villager.path[0]
        if (!next) {
            villager.pose = 'idle'
            continue
        }
        if (occupied(next, villager)) {
            villager.pose = 'idle'
            villager.waiting += seconds
            if (villager.waiting < PATIENCE) continue
            villager.waiting = 0
            // Sa place est prise (par le dresseur ou un autre) : il passe à la suite de sa tournée.
            if (same(next, goal) && shift.spots.length > 1) {
                villager.spotIndex++
                villager.path = []
                continue
            }
            // Sinon il contourne l'obstacle, s'il existe un détour.
            const detour = findPath(villager.tile, goal, (tile) => passable(tile) && !occupied(tile, villager))
            if (detour?.length) villager.path = detour
            continue
        }
        villager.waiting = 0
        villager.path.shift()
        villager.next = next
        villager.step = 0
        villager.facing = directionTo(villager.tile, next)
        villager.pose = shift.activity === 'play' || shelter ? 'run' : 'walk'
    }
}

/** E à côté d'un habitant : il s'arrête, se tourne vers le dresseur et dit une de ses répliques. */
export function talkTo(villagers: Villager[], player: Position, hour: number, context: { bossDefeated: boolean }, said: Map<string, number>) {
    const villager = villagers.find((candidate) => !candidate.inside && !candidate.next && distance(candidate.tile, player) === 1)
    if (!villager) return null
    villager.talking = TALK_SECONDS
    villager.facing = directionTo(villager.tile, player)
    const count = said.get(villager.profile.id) ?? 0
    said.set(villager.profile.id, count + 1)
    return {villager, text: lineFor(villager.profile, hour, context, count)}
}

/** Réplique selon l'heure, ce que le dresseur a accompli et le nombre de fois qu'on lui a parlé. */
export function lineFor(profile: Profile, hour: number, context: { bossDefeated: boolean }, count: number) {
    if (context.bossDefeated && count === 0) return `Tout Clairbois en parle : tu as vaincu Mewtwo ! — ${profile.name}`
    if (hour >= 19 && count % 2 === 0) return profile.child ? 'Maman va m’appeler pour le dîner…' : 'Il se fait tard. Les lanternes vont s’allumer.'
    return profile.lines[count % profile.lines.length]
}
