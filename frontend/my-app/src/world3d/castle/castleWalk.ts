/**
 * Déplacement libre dans le château, sans rendu : le dresseur est un disque qui glisse le long des murs et des
 * meubles. Les règles restent celles du plan case par case (castleLayout.ts) : chaque changement de case passe par
 * `moveInCastle` (objets, escaliers, sortie), et pousser une porte fermée ou un mur creux donne son évènement.
 */
import type { Direction } from '../../world/types'
import type { CastleEvent, CastleState, Tile } from './castleLayout'
import { DOORS, moveInCastle, tileAt } from './castleLayout'

/** Vitesse de marche (cases par seconde) et rayon du dresseur. */
export const WALK_SPEED = 3.4
export const WALK_RADIUS = 0.28
const EPSILON = 1e-4

export interface Point { x: number; z: number }

/** La case laisse-t-elle passer le dresseur ? Les portes fermées et les murs creux non poussés l'arrêtent. */
export function passable(state: Pick<CastleState, 'opened'>, tile: Tile) {
    const kind = tileAt(tile)
    if (kind === 'floor' || kind === 'stairs' || kind === 'exit') return true
    if (kind !== 'door') return false
    const door = DOORS.find((candidate) => candidate.floor === tile.floor && candidate.x === tile.x && candidate.z === tile.z)!
    return (!door.key && !door.secret) || state.opened.includes(door.id)
}

interface AxisMove { value: number; other: number; blocked: Tile | null }

/**
 * Avance sur un axe ; un obstacle arrête le bord du disque contre lui. Devant un passage d'une case (porte), un
 * dresseur un peu décalé est recentré sur l'autre axe, pour ne pas buter sur le chambranle.
 */
function moveAxis(state: CastleState, at: Point, distance: number, alongX: boolean): AxisMove {
    const position = alongX ? at.x : at.z, other = alongX ? at.z : at.x
    if (distance === 0) return {value: position, other, blocked: null}
    const next = position + distance
    const lead = Math.floor(next + Math.sign(distance) * WALK_RADIUS)
    const tile = (along: number, across: number): Tile => alongX ? {floor: state.floor, x: along, z: across} : {floor: state.floor, x: across, z: along}
    for (let across = Math.floor(other - WALK_RADIUS + EPSILON); across <= Math.floor(other + WALK_RADIUS - EPSILON); across++) {
        const blocking = tile(lead, across)
        if (passable(state, blocking)) continue
        const edge = distance > 0 ? lead - WALK_RADIUS - EPSILON : lead + 1 + WALK_RADIUS + EPSILON
        const stopped = distance > 0 ? Math.min(next, Math.max(position, edge)) : Math.max(next, Math.min(position, edge))
        // Passage libre droit devant le centre : on glisse vers son milieu. Sinon, l'obstacle signalé est celui
        // d'en face (une porte fermée plutôt que le mur voisin qu'effleure le disque).
        const ahead = Math.floor(other), facing = tile(lead, ahead)
        const free = passable(state, facing)
        const centered = across !== ahead && free
        const nudge = centered ? Math.sign(ahead + 0.5 - other) * Math.min(Math.abs(distance), Math.abs(ahead + 0.5 - other)) : 0
        return {value: stopped, other: other + nudge, blocked: centered ? null : free ? blocking : facing}
    }
    return {value: next, other, blocked: null}
}

const toward = (dx: number, dz: number): Direction => Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : (dz > 0 ? 'down' : 'up')

export interface WalkResult {
    state: CastleState
    position: Point
    /** Évènements des cases franchies (pas, objet, escalier, sortie) et de l'obstacle poussé (porte, mur creux). */
    events: CastleEvent[]
    /** Porte ou mur creux contre lequel le dresseur pousse, pour n'en signaler l'évènement qu'une fois. */
    pushing: Tile | null
}

/**
 * Un pas de temps de marche : `dx`, `dz` est la direction voulue (longueur 1 au plus), `distance` le trajet permis.
 * `pushing` est l'obstacle déjà poussé à l'image précédente : on ne répète pas son évènement tant qu'on y reste collé.
 */
export function walk(state: CastleState, at: Point, dx: number, dz: number, distance: number, pushing: Tile | null): WalkResult {
    if (dx === 0 && dz === 0) return {state, position: at, events: [], pushing: null}
    const facing = toward(dx, dz)
    const x = moveAxis(state, at, dx * distance, true)
    const z = moveAxis(state, {x: x.value, z: x.other}, dz * distance, false)
    const position = {x: z.other, z: z.value}
    let current: CastleState = {...state, facing}
    const events: CastleEvent[] = []

    // Cases franchies, un axe après l'autre ; un escalier ou la sortie arrête le trajet.
    for (const [along, target] of [['x', Math.floor(position.x)], ['z', Math.floor(position.z)]] as const) {
        const from = along === 'x' ? current.x : current.z
        if (target === from) continue
        const direction: Direction = along === 'x' ? (target > from ? 'right' : 'left') : (target > from ? 'down' : 'up')
        const {state: next, event} = moveInCastle(current, direction)
        events.push(event)
        if (event.type === 'stairs' || event.type === 'exit') {
            return {state: {...next, facing: event.type === 'stairs' ? next.facing : facing}, position: {x: next.x + 0.5, z: next.z + 0.5}, events, pushing: null}
        }
        if (event.type !== 'moved' && event.type !== 'pickup') return {state: current, position: at, events, pushing: null}
        current = {...next, facing}
    }

    // Obstacle poussé : une porte (fermée ou qui s'ouvre avec la clé du sac) ou un mur creux.
    const blocked = [x.blocked, z.blocked].find((tile) => tile && tileAt(tile) === 'door') ?? null
    const fresh = blocked && !(pushing && pushing.x === blocked.x && pushing.z === blocked.z && pushing.floor === blocked.floor)
    if (blocked && fresh && Math.abs(blocked.x - current.x) + Math.abs(blocked.z - current.z) === 1) {
        const direction = toward(blocked.x - current.x, blocked.z - current.z)
        const {state: next, event} = moveInCastle({...current, facing: direction}, direction)
        events.push(event)
        current = {...next, facing}
    }
    return {state: current, position, events, pushing: blocked}
}
