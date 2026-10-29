/**
 * Pêche au flotteur, sans three.js : lancer vers l'eau, attente, touches légères, ferrage quand le flotteur plonge,
 * puis combat où la tension du fil décide (trop forte trop longtemps, il casse ; trop molle trop longtemps, l'hameçon
 * se décroche).
 *
 * Une seule touche (F), voulue simple : appuyer pour lancer (la portée se règle seule sur l'eau devant soi) ;
 * appuyer quand le flotteur plonge pour ferrer, un appui trop tôt ne coûte rien ; pendant le combat, maintenir pour
 * mouliner, relâcher quand la jauge rougit. Le pêcheur peut marcher ligne à l'eau : le fil le suit tant qu'il reste
 * à portée du flotteur.
 */

/** Eau sous le flotteur : chaque eau a ses poissons. */
export type WaterKind = 'lake' | 'river' | 'flood'

export interface FishSpecies {
    speciesKey: string
    name: string
    /** Poids en kilogrammes, de la plus petite à la plus grosse prise. */
    weight: [number, number]
    /** Force de traction (0 à 1) d'un poisson moyen. */
    strength: number
    /** Secondes de lutte à pleine force avant épuisement. */
    stamina: number
    /** Touches légères avant la vraie touche (méfiance). */
    nibbles: [number, number]
    /** Durée pendant laquelle le flotteur reste sous l'eau : le temps de ferrer. */
    window: number
}

export const FISH: Record<string, FishSpecies> = {
    magikarp: {speciesKey: 'magikarp', name: 'Magicarpe', weight: [4, 13], strength: 0.3, stamina: 5, nibbles: [0, 1], window: 1.1},
    goldeen: {speciesKey: 'goldeen', name: 'Poissirène', weight: [8, 20], strength: 0.7, stamina: 9, nibbles: [1, 3], window: 0.7},
    poliwag: {speciesKey: 'poliwag', name: 'Ptitard', weight: [8, 16], strength: 0.4, stamina: 6, nibbles: [1, 2], window: 0.9},
    barboach: {speciesKey: 'barboach', name: 'Barloche', weight: [1, 3], strength: 0.55, stamina: 8, nibbles: [2, 3], window: 0.8},
    feebas: {speciesKey: 'feebas', name: 'Barpau', weight: [6, 9], strength: 0.5, stamina: 10, nibbles: [2, 4], window: 0.6},
    gyarados: {speciesKey: 'gyarados', name: 'Léviator', weight: [180, 270], strength: 1, stamina: 16, nibbles: [0, 0], window: 0.9},
}

/** Chances relatives de chaque espèce selon l'eau ; l'orage ajoute Léviator au lac. */
const WATERS: Record<WaterKind, [string, number][]> = {
    lake: [['magikarp', 50], ['goldeen', 24], ['poliwag', 14], ['barboach', 8], ['feebas', 4]],
    river: [['magikarp', 40], ['goldeen', 30], ['poliwag', 12], ['barboach', 18]],
    flood: [['barboach', 50], ['poliwag', 30], ['magikarp', 20]],
}
const STORM_CATCH: [string, number] = ['gyarados', 3]

/** Portée du lancer (m) : du plus court au plus long, et ce qu'on lance au-delà du bord de l'eau. */
export const CAST_MIN = 2.5, CAST_MAX = 9, PAST_BANK = 1.5
/** Éloigné du flotteur de plus que cela (en marchant), le pêcheur ramène sa ligne. */
export const LINE_REACH = 13
/** Longueur de fil sur le moulinet : au-delà, il casse. */
export const SPOOL = 22
/** Distance à laquelle le poisson est assez près pour l'épuisette. */
const LANDING = 0.8
/** Attente moyenne d'une touche, en secondes, avant les bonus d'heure et de temps. */
const MEAN_WAIT = 12
/**
 * Tension tenue au-delà de 1 avant que le fil casse, et mou toléré avant que l'hameçon se décroche : assez long pour
 * réagir à la jauge sans réflexe de champion.
 */
const SNAP_AFTER = 0.8, SLACK_AFTER = 3, SLACK = 0.08
/** Temps minimal pour ferrer une fois le flotteur plongé, et marge accordée sur la fenêtre propre à l'espèce. */
const BITE_MIN = 1.2, BITE_EASE = 1.6
/** Vitesse du moulinet (m/s) et de la fuite d'un poisson qui tire à fond (m/s). */
const REEL_SPEED = 1.6, RUN_SPEED = 1.3

export type FishingPhase = 'idle' | 'casting' | 'waiting' | 'bite' | 'fight'

export type FishingEvent =
    | { type: 'cast'; distance: number }
    | { type: 'splash' }
    | { type: 'missed' }
    | { type: 'nibble' }
    | { type: 'bite' }
    | { type: 'tooFar' }
    | { type: 'spat' }
    | { type: 'hooked'; fish: FishSpecies }
    | { type: 'jump' }
    | { type: 'snap' }
    | { type: 'unhooked' }
    | { type: 'landed'; fish: FishSpecies; weight: number }

export interface Point { x: number; z: number }

export interface FishingState {
    phase: FishingPhase
    /** Point où se tient le pêcheur et direction du lancer (vecteur unitaire au sol). */
    origin: Point
    heading: Point
    /** Flotteur (ou poisson ferré) : position au sol, et hauteur au-dessus de l'eau pendant le vol. */
    float: Point
    flight: number
    /** Temps écoulé dans la phase, et prochaine échéance (touche, fin de vol, fin de fenêtre…). */
    elapsed: number
    due: number
    water: WaterKind | null
    /** Poisson qui rôde autour du flotteur, puis ferré. */
    fish: FishSpecies | null
    weight: number
    nibbles: number
    /** Combat : tension (0 à 1, au-delà le fil cède), fil sorti (m), forces du poisson. */
    tension: number
    line: number
    pull: number
    stamina: number
    /** Écart de la fuite par rapport à l'axe du lancer, en radians. */
    angle: number
    over: number
    slack: number
    nextRun: number
}

export interface FishingWorld {
    /** Eau à cet endroit, ou `null` sur la terre ferme. */
    waterAt: (point: Point) => WaterKind | null
    hour: number
    /** Pluie de 0 à 1 et orage. */
    rain: number
    storm: boolean
    random: () => number
}

export function createFishing(): FishingState {
    return {
        phase: 'idle', origin: {x: 0, z: 0}, heading: {x: 0, z: 1}, float: {x: 0, z: 0}, flight: 0,
        elapsed: 0, due: 0, water: null, fish: null, weight: 0, nibbles: 0,
        tension: 0, line: 0, pull: 0, stamina: 0, angle: 0, over: 0, slack: 0, nextRun: 0,
    }
}

export const isFishing = (state: FishingState) => state.phase !== 'idle'

/** Ramène tout : le flotteur sort de l'eau, le poisson éventuel s'en va. */
export function reelIn(state: FishingState) {
    Object.assign(state, createFishing())
}

/**
 * Portée du lancer depuis `origin` vers `heading` : un peu au-delà du bord de l'eau, pour que le flotteur ne tombe pas
 * sur la berge ; `null` s'il n'y a pas d'eau à portée.
 */
export function castDistance(origin: Point, heading: Point, waterAt: FishingWorld['waterAt']): number | null {
    const at = (distance: number) => waterAt({x: origin.x + heading.x * distance, z: origin.z + heading.z * distance})
    for (let edge = CAST_MIN; edge <= CAST_MAX; edge += 0.5) {
        if (!at(edge)) continue
        const beyond = Math.min(CAST_MAX, edge + PAST_BANK)
        return at(beyond) ? beyond : edge
    }
    return null
}

/** Lance la ligne depuis `origin`, vers `heading`, à `distance` mètres. */
export function castLine(state: FishingState, origin: Point, heading: Point, distance: number): FishingEvent[] {
    if (state.phase !== 'idle') return []
    Object.assign(state, createFishing(), {origin: {...origin}, heading: {...heading}, line: distance})
    state.float = {x: origin.x + heading.x * distance, z: origin.z + heading.z * distance}
    setPhase(state, 'casting', flightTime(distance))
    return [{type: 'cast', distance}]
}

/**
 * Le pêcheur s'est déplacé : le flotteur (ou le poisson ferré) reste où il est et le fil se tend vers la nouvelle
 * position. Trop loin du flotteur, la ligne revient ; pendant un combat, trop de fil sorti la casse.
 */
export function moveAngler(state: FishingState, origin: Point): FishingEvent[] {
    if (state.phase !== 'waiting' && state.phase !== 'bite' && state.phase !== 'fight') return []
    const dx = state.float.x - origin.x, dz = state.float.z - origin.z
    const distance = Math.hypot(dx, dz)
    if (distance < 1e-3 || (origin.x === state.origin.x && origin.z === state.origin.z)) return []
    if (state.phase !== 'fight' && distance > LINE_REACH) {
        reelIn(state)
        return [{type: 'tooFar'}]
    }
    state.origin = {...origin}
    state.heading = {x: dx / distance, z: dz / distance}
    state.angle = 0
    state.line = distance
    return []
}

/** Durée du vol du flotteur pour une distance donnée. */
export const flightTime = (distance: number) => 0.35 + distance * 0.06

/**
 * Avance la pêche de `dt` secondes. `holding` : la touche de pêche est enfoncée ; `pressed` : elle vient de l'être
 * (front montant). Renvoie ce qui s'est passé, pour l'image et le son.
 */
export function updateFishing(state: FishingState, dt: number, holding: boolean, pressed: boolean, world: FishingWorld): FishingEvent[] {
    const events: FishingEvent[] = []
    state.elapsed += dt
    switch (state.phase) {
        case 'casting':
            if (state.elapsed >= state.due) splashDown(state, world, events)
            break
        case 'waiting':
            // Un appui avant la touche est ignoré : rater le bon moment ne doit pas coûter tout le lancer.
            if (state.elapsed < state.due) break
            if (!state.fish) {
                state.fish = pickFish(state.water!, world)
                const [least, most] = state.fish.nibbles
                state.nibbles = least + Math.floor(world.random() * (most - least + 1))
            }
            if (state.nibbles > 0) {
                state.nibbles--
                events.push({type: 'nibble'})
                state.elapsed = 0
                state.due = 0.6 + world.random() * 1.2
                break
            }
            events.push({type: 'bite'})
            setPhase(state, 'bite', Math.max(BITE_MIN, state.fish.window * BITE_EASE))
            break
        case 'bite':
            if (pressed) hook(state, world, events)
            else if (state.elapsed >= state.due) {
                // Raté : le poisson recrache l'appât et repart ; un autre viendra peut-être.
                events.push({type: 'spat'})
                state.fish = null
                setPhase(state, 'waiting', biteDelay(world))
            }
            break
        case 'fight':
            fight(state, dt, holding, world, events)
            break
    }
    return events
}

function setPhase(state: FishingState, phase: FishingPhase, due: number) {
    state.phase = phase
    state.elapsed = 0
    state.due = due
}

function splashDown(state: FishingState, world: FishingWorld, events: FishingEvent[]) {
    state.water = world.waterAt(state.float)
    if (!state.water) {
        events.push({type: 'missed'})
        reelIn(state)
        return
    }
    events.push({type: 'splash'})
    setPhase(state, 'waiting', biteDelay(world))
}

/** Attente avant qu'un poisson s'intéresse à l'appât : plus courte à l'aube, au crépuscule et sous une pluie fine. */
export function biteDelay(world: Pick<FishingWorld, 'hour' | 'rain' | 'storm' | 'random'>) {
    const {hour, rain, storm} = world
    let mean = MEAN_WAIT
    if ((hour >= 5 && hour < 8) || (hour >= 18 && hour < 21)) mean *= 0.6
    else if (hour >= 22 || hour < 5) mean *= 1.3
    // Une pluie fine trouble l'eau et rassure les poissons ; l'orage les envoie au fond.
    if (storm) mean *= 1.4
    else if (rain > 0.2) mean *= 0.75
    return Math.max(2.5, -Math.log(1 - world.random()) * mean)
}

export function pickFish(water: WaterKind, world: Pick<FishingWorld, 'storm' | 'random'>): FishSpecies {
    const table = water === 'lake' && world.storm ? [...WATERS.lake, STORM_CATCH] : WATERS[water]
    let roll = world.random() * table.reduce((sum, [, chance]) => sum + chance, 0)
    for (const [key, chance] of table) {
        roll -= chance
        if (roll < 0) return FISH[key]
    }
    return FISH[table[0][0]]
}

function hook(state: FishingState, world: FishingWorld, events: FishingEvent[]) {
    const fish = state.fish!
    const size = world.random()
    state.weight = Math.round((fish.weight[0] + (fish.weight[1] - fish.weight[0]) * size) * 10) / 10
    // Un gros spécimen tire plus fort et tient plus longtemps.
    state.stamina = fish.stamina * (0.8 + size * 0.4)
    state.tension = 0.3
    state.pull = fish.strength
    state.nextRun = 0
    state.angle = 0
    events.push({type: 'hooked', fish})
    setPhase(state, 'fight', 0)
}

/**
 * Le poisson alterne rushs et pauses ; le pêcheur mouline (la tension monte, le fil rentre) ou laisse filer (le frein
 * cède du fil, la tension retombe). La fatigue affaiblit les rushs.
 */
function fight(state: FishingState, dt: number, holding: boolean, world: FishingWorld, events: FishingEvent[]) {
    const fish = state.fish!
    const tired = Math.max(0.15, state.stamina / fish.stamina)
    if (state.elapsed >= state.nextRun) {
        const rush = world.random() < 0.45
        state.pull = fish.strength * tired * (rush ? 0.9 + world.random() * 0.5 : 0.2 + world.random() * 0.3)
        state.angle = Math.max(-0.9, Math.min(0.9, state.angle + (world.random() - 0.5) * (rush ? 0.8 : 0.3)))
        state.nextRun = state.elapsed + 0.7 + world.random() * 1.6
        // Magicarpe et Léviator sautent hors de l'eau pendant un rush.
        if (rush && (fish.speciesKey === 'magikarp' || fish.speciesKey === 'gyarados') && world.random() < 0.5) events.push({type: 'jump'})
    }
    const target = holding ? state.pull + 0.3 : state.pull * 0.3
    state.tension += (target - state.tension) * Math.min(1, dt * 4)
    state.line += (holding ? -REEL_SPEED * Math.max(0.1, 1 - state.pull) : RUN_SPEED * state.pull) * dt
    state.stamina = Math.max(0, state.stamina - dt * state.pull * (holding ? 1.2 : 0.6))
    const distance = Math.max(0, state.line)
    state.float = {
        x: state.origin.x + (state.heading.x * Math.cos(state.angle) - state.heading.z * Math.sin(state.angle)) * distance,
        z: state.origin.z + (state.heading.x * Math.sin(state.angle) + state.heading.z * Math.cos(state.angle)) * distance,
    }

    state.over = state.tension > 1 ? state.over + dt : 0
    state.slack = state.tension < SLACK ? state.slack + dt : 0
    if (state.over > SNAP_AFTER || state.line > SPOOL) {
        events.push({type: 'snap'})
        reelIn(state)
    } else if (state.slack > SLACK_AFTER) {
        events.push({type: 'unhooked'})
        reelIn(state)
    } else if (state.line <= LANDING) {
        events.push({type: 'landed', fish, weight: state.weight})
        reelIn(state)
    }
}

/** Phrase du HUD pour la phase en cours. */
export function describeFishing(state: FishingState) {
    switch (state.phase) {
        case 'casting': return 'Le flotteur file au-dessus de l’eau…'
        case 'waiting': return 'Le flotteur dérive. Quand il plonge : F pour ferrer · Échap : ramener'
        case 'bite': return 'Ça mord ! F pour ferrer !'
        case 'fight': return `${state.fish!.name} ferré ! Maintiens F pour mouliner, relâche quand la jauge rougit`
        default: return ''
    }
}
