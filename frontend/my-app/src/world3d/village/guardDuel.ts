/** Duel en temps réel de l'exploration. Réutilise dégâts, armes et points de vie locaux, sans toucher aux Pokémon. */
import type { Position } from '../../world/types'
import { createLife, isDead, strike, weaponById, type Life, type Target } from './combat'
import { findPath } from './pathfinding'
import { hasPoliceSight } from './police'

export type DuelResult = 'won' | 'lost' | 'fled'
export interface GuardDuel {
    kind: 'police' | 'warden'
    life: Life
    opponent: Target
    player: Target
    result: DuelResult | null
    path: Position[]
    repathIn: number
    cooldown: number
    windup: number
    stagger: number
    heading: number
    moving: boolean
}
export interface DuelWorld {
    /** Coordonnées du centre des corps, comme les armes et three.js. */
    player: Position
    passable: (tile: Position) => boolean
    blocksSight: (tile: Position) => boolean
}
export type DuelEvent = {type: DuelResult} | {type: 'player_hit'; damage: number; health: number}
const GUARD_WEAPON = {...weaponById('sword'), damage: 16}
const SPEED = 3.2, WINDUP = 0.65

export function createGuardDuel(kind: GuardDuel['kind'], position: Position): GuardDuel {
    return {kind, life: createLife(), opponent: {id: 'duel-guard', kind: 'guard', name: kind === 'warden' ? 'Geôlier' : 'Garde',
        x: position.x, y: position.y, maxHealth: 80},
        player: {id: 'duel-player', kind: 'player', name: 'Joueur', x: 0, y: 0, maxHealth: 100},
        result: null, path: [], repathIn: 0, cooldown: 1, windup: 0, stagger: 0, heading: 0, moving: false}
}

export function duelHealth(duel: GuardDuel, side: 'player' | 'opponent'): number {
    const target = duel[side]
    return isDead(duel.life, target.id) ? 0 : duel.life.health.get(target.id) ?? target.maxHealth
}

export function guardWasHit(duel: GuardDuel) {
    duel.stagger = 0.2
    duel.windup = 0
}

function advanceGuard(duel: GuardDuel, seconds: number, world: DuelWorld) {
    duel.repathIn -= seconds
    const guard = duel.opponent
    if (Math.hypot(guard.x - world.player.x, guard.y - world.player.y) <= 1.2) return
    if (duel.repathIn <= 0) {
        duel.path = findPath({x: Math.floor(guard.x), y: Math.floor(guard.y)},
            {x: Math.floor(world.player.x), y: Math.floor(world.player.y)}, world.passable) ?? []
        duel.repathIn = 0.8
    }
    let distance = seconds * SPEED
    while (duel.path.length && distance > 0) {
        const tile = duel.path[0]
        if (!world.passable(tile)) {duel.path = []; break}
        const dx = tile.x + 0.5 - guard.x, dy = tile.y + 0.5 - guard.y, length = Math.hypot(dx, dy)
        if (length < 0.001) {duel.path.shift(); continue}
        const step = Math.min(distance, length)
        guard.x += dx / length * step; guard.y += dy / length * step
        duel.heading = Math.atan2(dx, dy)
        duel.moving = true
        distance -= step
        if (step === length) duel.path.shift()
        if (Math.hypot(guard.x - world.player.x, guard.y - world.player.y) <= 1.2) break
    }
}

/** L'attaque du garde est annoncée avant l'impact ; reculer ou passer derrière un mur permet de l'éviter. */
export function updateGuardDuel(duel: GuardDuel, seconds: number, world: DuelWorld): DuelEvent[] {
    if (duel.result || seconds <= 0) return []
    if (duelHealth(duel, 'opponent') === 0) {duel.result = 'won'; duel.moving = false; duel.windup = 0; return [{type: 'won'}]}
    if (duel.kind === 'police' && Math.hypot(duel.opponent.x - world.player.x, duel.opponent.y - world.player.y) > 14) {
        duel.result = 'fled'; return [{type: 'fled'}]
    }
    duel.moving = false
    duel.cooldown -= seconds
    if (duel.stagger > 0) {duel.stagger -= seconds; return []}
    const guard = duel.opponent
    const nearby = () => Math.hypot(guard.x - world.player.x, guard.y - world.player.y) <= 1.8
        && hasPoliceSight({x: guard.x - 0.5, y: guard.y - 0.5}, {x: world.player.x - 0.5, y: world.player.y - 0.5}, world.blocksSight)
    if (duel.windup > 0) {
        duel.windup -= seconds
        if (duel.windup > 0) return []
        duel.cooldown = 1.2
        if (!nearby()) return []
        const hit = strike(duel.life, GUARD_WEAPON, duel.player)!
        if (hit.killed) {duel.result = 'lost'; return [{type: 'player_hit', damage: hit.damage, health: 0}, {type: 'lost'}]}
        return [{type: 'player_hit', damage: hit.damage, health: hit.health}]
    }
    duel.heading = Math.atan2(world.player.x - guard.x, world.player.y - guard.y)
    if (nearby()) {
        if (duel.cooldown <= 0) duel.windup = WINDUP
    } else advanceGuard(duel, seconds, world)
    return []
}
