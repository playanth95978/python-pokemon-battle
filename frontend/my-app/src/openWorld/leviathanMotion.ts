/**
 * Comportement du Léviathan, sans rendu : il patrouille dans l'eau profonde autour de son repaire, se dresse
 * quand le dresseur approche, attaque, replonge puis reprend sa nage. Le corps suit la trace laissée par la tête.
 */
import type { WorldGenerator } from './worldGenerator'
import { SEA_LEVEL } from './worldGenerator'

export type LeviathanPhase = 'swim' | 'rear' | 'attack' | 'dive'
export type LeviathanAttack = 'Hydrocanon' | 'Ouragan'

export interface Point { x: number; z: number }

export interface LeviathanState {
    home: Point
    x: number
    z: number
    heading: number
    phase: LeviathanPhase
    phaseTime: number
    cooldown: number
    attack: LeviathanAttack | null
    attacks: number
    /** Positions passées de la tête, de la plus récente à la plus ancienne. */
    trail: Point[]
}

/** Distance tête–dresseur sous laquelle E lance le combat : il nage au milieu du lit, le dresseur reste sur la berge. */
export const ENCOUNTER_RANGE = 7
export const SWIM_SPEED = 3.2
export const BODY_LENGTH = 13
export const ATTACK_RANGE = 18
export const PHASE_DURATION: Record<Exclude<LeviathanPhase, 'swim'>, number> = {rear: 1.1, attack: 1.7, dive: 1}
const COOLDOWN = 5, TURN_RATE = 1.5, FEELER = 3.5, TERRITORY = 70, TRAIL_STEP = 0.15
/** Eau assez profonde pour la tête ; le corps tient dans tout le lit. */
const DEEP = SEA_LEVEL - 0.6
const ATTACKS: LeviathanAttack[] = ['Hydrocanon', 'Ouragan']

export function isDeepWater(world: WorldGenerator, x: number, z: number) {
    return world.height(x, z) < DEEP
}

/** Case d'eau profonde la plus proche du repaire voulu, ou `null` s'il n'y en a pas dans `radius` cases. */
export function findWaterNear(world: WorldGenerator, x: number, z: number, radius = 30): Point | null {
    for (let distance = 0; distance <= radius; distance++) {
        for (let dz = -distance; dz <= distance; dz++) {
            for (let dx = -distance; dx <= distance; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== distance) continue
                if (isDeepWater(world, x + dx + 0.5, z + dz + 0.5)) return {x: x + dx + 0.5, z: z + dz + 0.5}
            }
        }
    }
    return null
}

export function createLeviathanState(world: WorldGenerator, home: Point): LeviathanState | null {
    const start = findWaterNear(world, Math.floor(home.x), Math.floor(home.z))
    if (!start) return null
    // Cap initial vers la direction où l'eau profonde s'étend le plus loin.
    let heading = 0, best = -1
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        let reach = 0
        while (reach < 20 && isDeepWater(world, start.x + Math.sin(angle) * reach, start.z + Math.cos(angle) * reach)) reach++
        if (reach > best) [best, heading] = [reach, angle]
    }
    return {home: start, ...start, heading, phase: 'swim', phaseTime: 0, cooldown: 2, attack: null, attacks: 0, trail: [{...start}]}
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

/** Nage : le cap suit l'eau la plus profonde devant (trois « antennes »), et revient vers le repaire s'il s'en éloigne. */
function swim(world: WorldGenerator, state: LeviathanState, dt: number) {
    let target = state.heading, bestScore = -Infinity
    for (const turn of [-0.7, -0.35, 0, 0.35, 0.7]) {
        const angle = state.heading + turn
        const x = state.x + Math.sin(angle) * FEELER, z = state.z + Math.cos(angle) * FEELER
        if (!isDeepWater(world, x, z)) continue
        const homeward = Math.hypot(state.home.x - x, state.home.z - z) > TERRITORY ? -Math.hypot(state.home.x - x, state.home.z - z) * 0.05 : 0
        // Une légère préférence pour tout droit évite le zigzag ; la profondeur garde la bête au milieu du lit.
        const score = -world.height(x, z) - Math.abs(turn) * 0.4 + homeward
        if (score > bestScore) [bestScore, target] = [score, angle]
    }
    // Plus d'eau devant : demi-tour sur place.
    if (bestScore === -Infinity) target = state.heading + Math.PI
    state.heading = wrap(state.heading + Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, wrap(target - state.heading))))
    const x = state.x + Math.sin(state.heading) * SWIM_SPEED * dt, z = state.z + Math.cos(state.heading) * SWIM_SPEED * dt
    if (isDeepWater(world, x, z)) [state.x, state.z] = [x, z]
}

function enter(state: LeviathanState, phase: LeviathanPhase) {
    state.phase = phase
    state.phaseTime = 0
}

/** Avance la simulation de `dt` secondes ; `player` est la position du dresseur (cases). */
export function stepLeviathan(world: WorldGenerator, state: LeviathanState, dt: number, player: Point) {
    state.phaseTime += dt
    state.cooldown -= dt
    const toPlayer = Math.hypot(player.x - state.x, player.z - state.z)
    if (state.phase === 'swim') {
        swim(world, state, dt)
        if (state.cooldown <= 0 && toPlayer < ATTACK_RANGE) {
            state.attack = ATTACKS[state.attacks % ATTACKS.length]
            state.attacks++
            enter(state, 'rear')
        }
    } else {
        // Dressé ou en attaque, il fait face au dresseur sans avancer.
        const facing = Math.atan2(player.x - state.x, player.z - state.z)
        if (state.phase !== 'dive') state.heading = wrap(state.heading + wrap(facing - state.heading) * Math.min(1, dt * 4))
        if (state.phaseTime >= PHASE_DURATION[state.phase]) {
            if (state.phase === 'rear') enter(state, 'attack')
            else if (state.phase === 'attack') enter(state, 'dive')
            else {
                enter(state, 'swim')
                state.attack = null
                state.cooldown = COOLDOWN
            }
        }
    }
    const last = state.trail[0]
    if (Math.hypot(state.x - last.x, state.z - last.z) >= TRAIL_STEP) {
        state.trail.unshift({x: state.x, z: state.z})
        state.trail.length = Math.min(state.trail.length, Math.ceil(BODY_LENGTH / TRAIL_STEP) + 20)
    }
}

/** Le dresseur est assez près de la tête pour l'affronter. */
export function canChallenge(state: LeviathanState, player: Point) {
    return Math.hypot(player.x - state.x, player.z - state.z) <= ENCOUNTER_RANGE
}

/** Part dressée du corps, de 0 (à plat dans l'eau) à 1 (cou levé, tête au-dessus du dresseur). */
export function rearAmount(state: LeviathanState) {
    const smooth = (t: number) => t * t * (3 - 2 * t)
    if (state.phase === 'rear') return smooth(Math.min(1, state.phaseTime / PHASE_DURATION.rear))
    if (state.phase === 'attack') return 1
    if (state.phase === 'dive') return 1 - smooth(Math.min(1, state.phaseTime / PHASE_DURATION.dive))
    return 0
}

/**
 * `count` points de la colonne vertébrale, espacés de `BODY_LENGTH / (count - 1)` le long de la trace de la tête.
 * Au début, la trace est trop courte : le reste du corps s'aligne derrière la tête, dans l'axe de la nage.
 */
export function spinePoints(state: LeviathanState, count: number): Point[] {
    const spacing = BODY_LENGTH / (count - 1)
    const points: Point[] = [{x: state.x, z: state.z}]
    let segment = 0, from: Point = {x: state.x, z: state.z}, travelled = 0
    for (let index = 1; index < count; index++) {
        const wanted = index * spacing
        while (segment < state.trail.length) {
            const to = state.trail[segment]
            const length = Math.hypot(to.x - from.x, to.z - from.z)
            if (travelled + length >= wanted) {
                const t = length ? (wanted - travelled) / length : 0
                points.push({x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t})
                break
            }
            travelled += length
            from = to
            segment++
        }
        if (points.length === index) {
            const back = wanted - travelled
            points.push({x: from.x - Math.sin(state.heading) * back, z: from.z - Math.cos(state.heading) * back})
        }
    }
    return points
}
