import { describe, expect, it, vi } from 'vitest'
import type { Position } from '../../world/types'
import { canEnter, tileAt, WORLD_MAP } from '../../world/worldMap'
import { castleBlocks } from '../castle/castleArea'
import { createLife, strike, weaponById, type Hit, type Target } from './combat'
import { findPath } from './pathfinding'
import { ARREST_SECONDS, createPolice, describePolice, ESCAPE_SECONDS, finishArrest, hasPoliceSight, MAX_OFFICERS, resumeAfterResistance,
    officerPosition, policeAt, reportKilling, updatePolice, type MountedOfficer, type PoliceState, type PoliceWorld } from './police'

const victim: Target = {id: 'villager', kind: 'villager', name: 'Habitant', x: 30, y: 31, maxHealth: 40}
const killing: Hit = {target: victim, damage: 40, health: 0, killed: true}
const plain: PoliceWorld = {player: {x: 30, y: 30}, onLand: true,
    passable: ({x, y}) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < 70 && y < 70,
    blocksSight: () => false}
const officer = (x: number, y: number, id = 0): MountedOfficer => ({id, tile: {x, y}, next: null, step: 0, path: [], heading: 0, repathIn: 0, moving: false})

function simulate(state: PoliceState, seconds: number, world: PoliceWorld) {
    const events = []
    for (let time = 0; time < seconds; time += 0.05) events.push(...updatePolice(state, Math.min(0.05, seconds - time), world))
    return events
}

describe('Garde montée de Clairbois', () => {
    it('reprend la poursuite après une résistance avec une marge pour fuir et sans le garde vaincu', () => {
        const state = createPolice()
        reportKilling(state, killing, plain.player)
        state.arrested = true
        state.officers = [officer(29, 30, 0), officer(31, 30, 1)]
        resumeAfterResistance(state, plain.player, 1)
        expect(state.arrested).toBe(false)
        expect(state.level).toBe(2)
        expect(state.officers.map((guard) => guard.id)).toEqual([0])
        expect(simulate(state, 7, plain)).toEqual([])
        expect(state.contactSeconds).toBe(0)
    })
    it('déclenche la recherche sur une mort humaine, sans recompter les coups ni les cadavres', () => {
        const life = createLife(), state = createPolice()
        expect(reportKilling(state, strike(life, weaponById('fists'), victim)!, plain.player)).toBe(false)
        expect(state.level).toBe(0)
        expect(reportKilling(state, strike(life, weaponById('bow'), victim)!, plain.player)).toBe(true)
        expect(state.level).toBe(1)
        expect(strike(life, weaponById('bow'), victim)).toBeNull()
        expect(reportKilling(state, {...killing, target: {...victim, kind: 'pokemon'}}, plain.player)).toBe(false)
        expect(state.level).toBe(1)
        expect(describePolice(state)).toContain('★☆☆')
    })

    it('borne les étoiles et les renforts, en faisant arriver les chevaux loin du joueur', () => {
        const state = createPolice()
        for (let crime = 0; crime < 10; crime++) reportKilling(state, killing, plain.player)
        expect(state.level).toBe(3)
        updatePolice(state, 0.05, {...plain, onLand: false})
        expect(state.officers).toHaveLength(1)
        expect(Math.hypot(state.officers[0].tile.x - 30, state.officers[0].tile.y - 30)).toBeGreaterThanOrEqual(14)
        simulate(state, 10, {...plain, onLand: false})
        expect(state.officers).toHaveLength(MAX_OFFICERS)
        expect(new Set(state.officers.map((guard) => guard.id)).size).toBe(MAX_OFFICERS)
    })

    it('poursuit en contournant les murs, puis interpelle sans infliger de dégâts au combat Pokémon', () => {
        const state = createPolice()
        reportKilling(state, killing, {x: 10, y: 10})
        state.officers = [officer(5, 10)]
        state.dispatchIn = 100
        const world = {...plain, player: {x: 10, y: 10},
            passable: (p: Position) => plain.passable(p) && !(p.x === 7 && p.y < 13),
            blocksSight: (p: Position) => p.x === 7 && p.y < 13}
        let arrested = false
        for (let tick = 0; tick < 400 && !arrested; tick++) {
            arrested = updatePolice(state, 0.05, world).some((event) => event.type === 'arrested')
            for (const guard of state.officers) {
                expect(world.passable(guard.tile)).toBe(true)
                if (guard.next) expect(world.passable(guard.next)).toBe(true)
            }
        }
        expect(arrested).toBe(true)
        expect(state.arrested).toBe(true)
        expect(state.level).toBe(1)
        expect(state.officers).toHaveLength(1)
        expect(finishArrest(state)).toBe(true)
        expect(state.level).toBe(0)
        expect(state.officers).toEqual([])
    })

    it('n’arrête pas un joueur qui court à proximité et remet la progression à zéro au départ', () => {
        const state = createPolice()
        reportKilling(state, killing, plain.player)
        state.officers = [officer(29, 30)]
        state.dispatchIn = 100
        simulate(state, 1, plain)
        expect(state.contactSeconds).toBeCloseTo(1)
        expect(simulate(state, ARREST_SECONDS * 2, {...plain, playerMoving: true})).toEqual([])
        expect(state.contactSeconds).toBe(0)
        expect(state.level).toBe(1)
        expect(state.officers).toHaveLength(1)
        expect(state.arrested).toBe(false)
        expect(simulate(state, ARREST_SECONDS + 0.1, plain)).toEqual([{type: 'arrested'}])
    })

    it('garde la scène d’interpellation jusqu’au retour explicite et n’émet l’événement qu’une fois', () => {
        const state = createPolice()
        reportKilling(state, killing, plain.player)
        expect(finishArrest(state)).toBe(false)
        expect(state.level).toBe(1)
        state.officers = [officer(29, 30)]
        state.dispatchIn = 100
        expect(simulate(state, ARREST_SECONDS + 0.1, plain)).toEqual([{type: 'arrested'}])
        expect(describePolice(state)).toContain('Interpellation')
        const arrestedState = structuredClone(state)
        expect(simulate(state, 60, plain)).toEqual([])
        expect(reportKilling(state, killing, plain.player)).toBe(false)
        expect(state).toEqual(arrestedState)
        expect(finishArrest(state)).toBe(true)
        expect(state.officers).toEqual([])
        expect(describePolice(state)).toBeNull()
        expect(finishArrest(state)).toBe(false)
    })

    it('ne connaît pas les mouvements cachés derrière les murs et lève la recherche après la fuite', () => {
        const state = createPolice()
        reportKilling(state, killing, {x: 10, y: 10})
        state.officers = [officer(3, 10)]
        state.dispatchIn = 100
        const world = {...plain, player: {x: 20, y: 10}, passable: (p: Position) => plain.passable(p) && p.x !== 12,
            blocksSight: (p: Position) => p.x === 12}
        expect(hasPoliceSight({x: 3, y: 10}, world.player, world.blocksSight)).toBe(false)
        simulate(state, 5, world)
        expect(state.lastSeen).toEqual({x: 10, y: 10})
        expect(state.level).toBe(1)
        expect(simulate(state, ESCAPE_SECONDS, world)).toContainEqual({type: 'escaped'})
        expect(describePolice(state)).toBeNull()
    })

    it('exige un contact continu et ne permet pas une interpellation à travers un mur ou sur l’eau', () => {
        const state = createPolice()
        reportKilling(state, killing, plain.player)
        state.officers = [officer(29, 30)]
        state.dispatchIn = 100
        simulate(state, 1, plain)
        expect(state.contactSeconds).toBeCloseTo(1)
        updatePolice(state, 0.05, {...plain, player: {x: 35, y: 30}})
        expect(state.contactSeconds).toBe(0)
        state.officers = [officer(29, 30)]
        simulate(state, ARREST_SECONDS + 1, {...plain, onLand: false})
        expect(state.level).toBe(1)
        expect(state.contactSeconds).toBe(0)
        state.officers = [officer(29, 30)]
        const wall = {...plain, blocksSight: () => true}
        simulate(state, 1, wall)
        expect(state.contactSeconds).toBe(0)
        expect(simulate(state, ARREST_SECONDS + 0.1, plain)).toContainEqual({type: 'arrested'})
    })

    it('ne construit aucun chemin hors recherche, en pause, ni plus d’un chemin par image', () => {
        const state = createPolice(), pathfind = vi.fn(findPath), world = {...plain, pathfind, onLand: false}
        updatePolice(state, 0.05, world)
        expect(pathfind).not.toHaveBeenCalled()
        reportKilling(state, killing, plain.player)
        const before = structuredClone(state)
        updatePolice(state, 0, world)
        expect(state).toEqual(before)
        for (let tick = 0; tick < 200; tick++) {
            pathfind.mockClear()
            updatePolice(state, 0.05, world)
            expect(pathfind.mock.calls.length).toBeLessThanOrEqual(1)
        }
    })

    it('réserve les cases des montures et attend devant un passant sans le traverser', () => {
        const state = createPolice()
        reportKilling(state, killing, plain.player)
        state.officers = [officer(25, 30)]
        state.officers[0].path = [{x: 26, y: 30}, {x: 27, y: 30}]
        state.officers[0].repathIn = 100
        state.dispatchIn = 100
        updatePolice(state, 0.1, {...plain, occupied: (p) => p.x === 26 && p.y === 30})
        expect(officerPosition(state.officers[0])).toEqual({x: 25, y: 30})
        expect(policeAt(state, {x: 25, y: 30})).toBe(true)
        updatePolice(state, 0.05, plain)
        expect(policeAt(state, {x: 26, y: 30})).toBe(true)
        expect(policeAt(state, {x: 28, y: 30})).toBe(false)
    })

    it('trouve des arrivées et poursuit sur la vraie carte en respectant les rivières et le château', () => {
        for (const player of [{x: 18, y: 36}, {x: 80, y: 34}, {x: 128, y: 34}, {x: 84, y: 90}]) {
            const state = createPolice()
            reportKilling(state, killing, player)
            const world = {...plain, player, onLand: false,
                passable: (p: Position) => canEnter(tileAt(WORLD_MAP, p), 'walking') && !castleBlocks(p),
                blocksSight: (p: Position) => ['tree', 'wall'].includes(tileAt(WORLD_MAP, p) ?? 'wall') || castleBlocks(p)}
            let arrived = false
            for (let tick = 0; tick < 120; tick++) {
                updatePolice(state, 0.05, world)
                arrived ||= state.officers.length > 0
                for (const guard of state.officers) {
                    expect(world.passable(guard.tile)).toBe(true)
                    if (guard.next) expect(world.passable(guard.next)).toBe(true)
                }
            }
            expect(arrived, `${player.x},${player.y}`).toBe(true)
        }
    })
})
