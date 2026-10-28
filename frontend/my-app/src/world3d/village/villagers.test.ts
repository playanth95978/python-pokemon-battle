import { describe, expect, it } from 'vitest'
import type { Position } from '../../world/types'
import { canEnter, tileAt, WORLD_MAP, WORLD_SPAWN } from '../../world/worldMap'
import { castleBlocks } from '../castle/castleArea'
import { findPath } from './pathfinding'
import { advanceHour, formatHour } from './villageClock'
import type { Villager } from './villagers'
import { createVillagers, goalOf, lineFor, shiftAt, talkTo, updateVillagers, VILLAGERS, villagerAt } from './villagers'

const passable = (tile: Position) => canEnter(tileAt(WORLD_MAP, tile), 'walking') && !castleBlocks(tile)
const key = ({x, y}: Position) => `${x},${y}`

/** Fait vivre le village de `from` à `to` heures, par pas de 0,1 s, en vérifiant qu'il n'y a jamais deux habitants sur une case. */
function live(villagers: Villager[], from: number, to: number, player: Position = WORLD_SPAWN) {
    let hour = from
    while (hour < to) {
        updateVillagers(villagers, hour, 0.1, player, passable)
        const tiles = villagers.filter((villager) => !villager.inside).flatMap((villager) => [villager.tile, villager.next].filter(Boolean) as Position[])
        expect(new Set(tiles.map(key)).size, `à ${formatHour(hour)}`).toBe(tiles.length)
        expect(tiles.some((tile) => key(tile) === key(player))).toBe(false)
        hour = advanceHour(hour, 0.1)
        if (hour < from) break
    }
    return hour
}

describe('Vie du village', () => {
    it('trouve le plus court chemin autour d’un obstacle, ou rien si la case est inaccessible', () => {
        const wall = (tile: Position) => tile.x >= 0 && tile.x < 5 && tile.y >= 0 && tile.y < 5 && !(tile.x === 2 && tile.y < 4)
        expect(findPath({x: 0, y: 2}, {x: 4, y: 2}, wall)).toHaveLength(8)
        expect(findPath({x: 0, y: 2}, {x: 0, y: 2}, wall)).toEqual([])
        expect(findPath({x: 0, y: 2}, {x: 2, y: 2}, wall)).toBeNull()
    })

    it('laisse chaque habitant rejoindre tous ses lieux depuis sa porte', () => {
        for (const profile of VILLAGERS) {
            expect(passable(profile.home), `${profile.name} : porte`).toBe(true)
            for (const shift of profile.schedule) for (const spot of shift.spots) {
                expect(findPath(profile.home, spot, passable), `${profile.name} → ${key(spot)}`).not.toBeNull()
            }
        }
    })

    it('ne donne jamais le même rendez-vous à deux habitants à la même heure', () => {
        for (let hour = 0; hour < 24; hour += 0.5) {
            const goals = createVillagers(VILLAGERS, hour).filter((villager) => !villager.inside).map((villager) => key(goalOf(villager)))
            expect(new Set(goals).size, formatHour(hour)).toBe(goals.length)
        }
    })

    it('suit l’emploi du temps : forge le matin, retour à la maison le soir, sans jamais se marcher dessus', () => {
        const villagers = createVillagers(VILLAGERS, 5)
        expect(villagers.every((villager) => villager.inside === (shiftAt(villager.profile.schedule, 5).activity === 'sleep'))).toBe(true)
        live(villagers, 5, 10.5)
        const aldric = villagers.find((villager) => villager.profile.id === 'aldric')!
        expect(aldric).toMatchObject({inside: false, tile: {x: 9, y: 37}, pose: 'hammer', facing: 'left'})
        expect(villagerAt(villagers, {x: 9, y: 37})).toBe(aldric)
        live(villagers, 10.5, 23.5)
        expect(villagers.filter((villager) => !villager.inside).map((villager) => villager.profile.name)).toEqual([])
    })

    it('s’arrête pour parler au dresseur, se tourne vers lui et varie ses répliques', () => {
        const villagers = createVillagers(VILLAGERS, 10)
        const said = new Map<string, number>()
        const first = talkTo(villagers, {x: 10, y: 37}, 10, {bossDefeated: false}, said)
        expect(first?.villager.profile.id).toBe('aldric')
        expect(first?.villager.facing).toBe('right')
        expect(first?.text).toBe(first?.villager.profile.lines[0])
        expect(talkTo(villagers, {x: 10, y: 37}, 10, {bossDefeated: false}, said)?.text).toBe(first?.villager.profile.lines[1])
        updateVillagers(villagers, 10, 1, {x: 10, y: 37}, passable)
        expect(first?.villager.pose).toBe('idle')
        expect(talkTo(villagers, {x: 30, y: 30}, 10, {bossDefeated: false}, said)).toBeNull()
        expect(lineFor(VILLAGERS[0], 10, {bossDefeated: true}, 0)).toContain('Mewtwo')
        expect(lineFor(VILLAGERS[0], 20, {bossDefeated: false}, 0)).toContain('lanternes')
    })

    it('fait tourner l’horloge : douze minutes pour une journée', () => {
        expect(advanceHour(23.5, 30)).toBeCloseTo(0.5)
        expect(formatHour(9.0834)).toBe('9 h 05')
    })
})
