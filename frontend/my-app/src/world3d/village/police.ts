/** Police du monde d'exploration, indépendante du rendu et des combats Pokémon côté serveur. */
import type { Position } from '../../world/types'
import type { Hit } from './combat'
import { findPath } from './pathfinding'

export const MAX_WANTED_LEVEL = 3, MAX_OFFICERS = 4
export const SIGHT_RANGE = 22, ARREST_RANGE = 1.5, ARREST_SECONDS = 2.5
export const ESCAPE_SECONDS = 30
const HORSE_SPEED = 6.5, REPATH_SECONDS = 0.8, DISPATCH_SECONDS = 2

export interface MountedOfficer {
    id: number
    tile: Position
    next: Position | null
    step: number
    path: Position[]
    heading: number
    repathIn: number
    moving: boolean
}

export interface PoliceState {
    level: number
    arrested: boolean
    graceSeconds: number
    officers: MountedOfficer[]
    lastSeen: Position | null
    unseenSeconds: number
    contactSeconds: number
    dispatchIn: number
    spawnCursor: number
    nextId: number
}

export interface PoliceWorld {
    /** Position continue en cases, centres entiers comme les habitants (pas en coordonnées three.js). */
    player: Position
    onLand: boolean
    /** Une proximité pendant une course n'est pas une immobilisation. */
    playerMoving?: boolean
    passable: (position: Position) => boolean
    blocksSight: (position: Position) => boolean
    occupied?: (position: Position) => boolean
    /** Injection utile pour vérifier le budget de recherches sans dépendre du rendu. */
    pathfind?: typeof findPath
}

export type PoliceEvent = {type: 'arrested'} | {type: 'escaped'}

export function createPolice(): PoliceState {
    return {level: 0, arrested: false, graceSeconds: 0, officers: [], lastSeen: null, unseenSeconds: 0, contactSeconds: 0, dispatchIn: 0, spawnCursor: 0, nextId: 0}
}

/** Le moteur d'armes garantit qu'un cadavre ne produit pas un deuxième Hit. */
export function reportKilling(state: PoliceState, hit: Hit, player: Position): boolean {
    if (state.arrested || !hit.killed || hit.target.kind !== 'villager') return false
    state.level = Math.min(MAX_WANTED_LEVEL, state.level + 1)
    state.lastSeen = {x: Math.round(player.x), y: Math.round(player.y)}
    state.unseenSeconds = state.contactSeconds = 0
    state.dispatchIn = Math.min(state.dispatchIn, 0.5)
    return true
}

export function officerPosition(officer: MountedOfficer): Position {
    return officer.next ? {x: officer.tile.x + (officer.next.x - officer.tile.x) * officer.step,
        y: officer.tile.y + (officer.next.y - officer.tile.y) * officer.step} : officer.tile
}

export function policeAt(state: PoliceState, tile: Position): boolean {
    return state.officers.some((officer) => same(officer.tile, tile) || (officer.next !== null && same(officer.next, tile)))
}

/** Murs et arbres coupent la vue ; l'eau reste transparente au regard mais interdit le passage. */
export function hasPoliceSight(from: Position, to: Position, blocks: PoliceWorld['blocksSight']): boolean {
    const dx = to.x - from.x, dy = to.y - from.y, samples = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2)
    for (let sample = 1; sample < samples; sample++) {
        if (blocks({x: Math.round(from.x + dx * sample / samples), y: Math.round(from.y + dy * sample / samples)})) return false
    }
    return true
}

const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y)
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y

function routeTo(from: Position, target: Position, world: PoliceWorld, pathfind: typeof findPath) {
    return pathfind(from, target, (tile) => world.passable(tile) && (same(tile, target) || !world.occupied?.(tile)))
}

function seesPlayer(officer: MountedOfficer, world: PoliceWorld) {
    const position = officerPosition(officer)
    return distance(position, world.player) <= SIGHT_RANGE && hasPoliceSight(position, world.player, world.blocksSight)
}

/** Une arrivée hors du voisinage immédiat, avec un véritable chemin terrestre jusqu'au dernier signalement. */
function dispatchOfficer(state: PoliceState, world: PoliceWorld, pathfind: typeof findPath): boolean {
    if (state.officers.length >= Math.min(MAX_OFFICERS, state.level + 1) || state.dispatchIn > 0 || !state.lastSeen) return false
    // Au plus 24 candidats simples et une seule recherche A* par appel.
    for (let attempt = 0; attempt < 24; attempt++) {
        const cursor = state.spawnCursor++, radius = 16 + Math.floor(cursor / 16) % 3 * 4
        const angle = cursor % 16 * Math.PI / 8
        const tile = {x: Math.round(state.lastSeen.x + Math.cos(angle) * radius), y: Math.round(state.lastSeen.y + Math.sin(angle) * radius)}
        if (!world.passable(tile) || world.occupied?.(tile) || state.officers.some((officer) => distance(officerPosition(officer), tile) < 3)
            || distance(tile, world.player) < 14) continue
        const path = routeTo(tile, state.lastSeen, world, pathfind)
        if (path) {
            state.officers.push({id: state.nextId++, tile, next: null, step: 0, path, heading: 0, repathIn: REPATH_SECONDS, moving: false})
            state.dispatchIn = DISPATCH_SECONDS
        }
        return true
    }
    return false
}

function moveOfficer(officer: MountedOfficer, seconds: number, world: PoliceWorld, officers: MountedOfficer[]) {
    officer.moving = false
    let movement = seconds * HORSE_SPEED
    while (movement > 0) {
        if (!officer.next) {
            const next = officer.path[0]
            if (!next || distance(officerPosition(officer), world.player) <= 1.25) break
            if (!world.passable(next)) { officer.path = []; officer.repathIn = 0; break }
            const taken = world.occupied?.(next) || officers.some((other) => other !== officer
                && (same(other.tile, next) || (other.next && same(other.next, next))))
            // On attend une case réservée, sans traverser habitants ou autres chevaux.
            if (taken || same(next, {x: Math.round(world.player.x), y: Math.round(world.player.y)})) break
            officer.next = next
            officer.path.shift()
            officer.heading = Math.atan2(next.x - officer.tile.x, next.y - officer.tile.y)
        }
        officer.moving = true
        const advance = Math.min(movement, 1 - officer.step)
        officer.step += advance
        movement -= advance
        if (officer.step < 1) break
        officer.tile = officer.next
        officer.next = null
        officer.step = 0
    }
}

function clearPursuit(state: PoliceState) {
    state.level = 0
    state.arrested = false
    state.graceSeconds = 0
    state.officers = []
    state.lastSeen = null
    state.contactSeconds = state.unseenSeconds = 0
    state.dispatchIn = 0
}

/** La scène et les cavaliers restent présents jusqu'à l'acquittement de l'interpellation. */
export function finishArrest(state: PoliceState): boolean {
    if (!state.arrested) return false
    clearPursuit(state)
    return true
}

/** Une résistance réussie donne le temps de repartir ; les autres cavaliers reprennent ensuite la poursuite. */
export function resumeAfterResistance(state: PoliceState, player: Position, defeatedOfficer: number | null) {
    state.arrested = false
    state.level = Math.min(MAX_WANTED_LEVEL, state.level + 1)
    state.contactSeconds = state.unseenSeconds = 0
    state.lastSeen = {x: Math.round(player.x), y: Math.round(player.y)}
    state.graceSeconds = 8
    state.dispatchIn = 3
    if (defeatedOfficer !== null) state.officers = state.officers.filter((officer) => officer.id !== defeatedOfficer)
}

/**
 * Appelé uniquement dehors, hors pause. Budget : un A* au maximum par image, partagé entre arrivée et poursuite.
 * La police cherche la dernière position vue ; elle ne connaît pas les déplacements derrière un mur.
 */
export function updatePolice(state: PoliceState, seconds: number, world: PoliceWorld): PoliceEvent[] {
    if (state.level === 0 || state.arrested || seconds <= 0) return []
    state.graceSeconds = Math.max(0, state.graceSeconds - seconds)
    state.dispatchIn -= seconds
    const seen = state.officers.some((officer) => seesPlayer(officer, world))
    if (seen) {
        state.unseenSeconds = 0
        const tile = {x: Math.round(world.player.x), y: Math.round(world.player.y)}
        if (world.onLand && world.passable(tile)) state.lastSeen = tile
    } else state.unseenSeconds += seconds

    const escapeAfter = ESCAPE_SECONDS + (state.level - 1) * 10
    if (state.unseenSeconds >= escapeAfter) { clearPursuit(state); return [{type: 'escaped'}] }
    const pathfind = world.pathfind ?? findPath
    let usedPathBudget = dispatchOfficer(state, world, pathfind)
    for (const officer of state.officers) {
        officer.repathIn -= seconds
        if (officer.repathIn <= 0 && !officer.next && state.lastSeen && !usedPathBudget) {
            officer.path = routeTo(officer.tile, state.lastSeen, world, pathfind) ?? []
            officer.repathIn = REPATH_SECONDS
            usedPathBudget = true
        }
        moveOfficer(officer, seconds, world, state.officers)
    }

    const close = state.graceSeconds === 0 && world.onLand && !world.playerMoving && state.officers.some((officer) => distance(officerPosition(officer), world.player) <= ARREST_RANGE && seesPlayer(officer, world))
    state.contactSeconds = close ? state.contactSeconds + seconds : 0
    if (state.contactSeconds >= ARREST_SECONDS) {
        state.arrested = true
        state.officers.forEach((officer) => { officer.moving = false })
        return [{type: 'arrested'}]
    }
    return []
}

export function describePolice(state: PoliceState): string | null {
    if (!state.level) return null
    const stars = '★'.repeat(state.level) + '☆'.repeat(MAX_WANTED_LEVEL - state.level)
    const status = state.arrested ? 'Interpellation · se rendre ou résister'
        : state.contactSeconds > 0 ? `Interpellation ${Math.floor(state.contactSeconds / ARREST_SECONDS * 100)} % — éloigne-toi !`
        : !state.officers.length ? 'Cavalerie en approche'
        : state.unseenSeconds > 2 ? `Dernière position recherchée · ${Math.ceil(ESCAPE_SECONDS + (state.level - 1) * 10 - state.unseenSeconds)} s pour semer la garde`
        : 'La garde montée te poursuit'
    return `${stars} · ${status}`
}
