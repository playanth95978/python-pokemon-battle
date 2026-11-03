import { describe, expect, it } from 'vitest'
import { findPath } from '../village/pathfinding'
import { createPrison, defeatWarden, interactPrison, prisonPassable, CELL_DOOR, PRISON_EXIT, WARDEN_SPAWN } from './prison'
import { PRISON_ENTRANCE } from './prisonLocation'
import { tileAt, WORLD_MAP } from '../../world/worldMap'

describe('Prison de Clairbois', () => {
    it('garde le détenu en cellule sans passage détourné au travers des murs', () => {
        const prison = createPrison()
        expect(prisonPassable(prison, CELL_DOOR)).toBe(false)
        expect(findPath(prison.position, PRISON_EXIT, (tile) => prisonPassable(prison, tile))).toBeNull()
        prison.position = {x: 6, y: 10}
        expect(interactPrison(prison)).toBe('challenge')
        expect(prisonPassable(prison, CELL_DOOR)).toBe(true)
        expect(findPath(prison.position, WARDEN_SPAWN, (tile) => prisonPassable(prison, tile))).not.toBeNull()
    })

    it('exige de vaincre le gardien, ramasser les clés, puis ouvrir la sortie', () => {
        const prison = createPrison()
        prison.position = {...PRISON_EXIT}
        expect(interactPrison(prison)).toBeNull()
        prison.position = {x: 6, y: 10}
        interactPrison(prison)
        defeatWarden(prison, {x: 9.5, y: 10.5})
        expect(prison.keys).toEqual(WARDEN_SPAWN)
        expect(interactPrison(prison)).toBeNull()
        prison.position = {...WARDEN_SPAWN}
        expect(interactPrison(prison)).toBe('keys')
        expect(prison.hasKeys).toBe(true)
        expect(prison.keys).toBeNull()
        defeatWarden(prison, {x: 9.5, y: 10.5})
        expect(prison.keys).toBeNull()
        prison.position = {...PRISON_EXIT}
        expect(interactPrison(prison)).toBe('exit')
    })

    it('réinitialise cellule et geôlier après une nouvelle détention, et autorise une visite libre', () => {
        const prison = createPrison()
        expect(prison.guardDefeated).toBe(false)
        expect(prison.hasKeys).toBe(false)
        const visitor = createPrison(false)
        expect(visitor.cellOpen).toBe(true)
        visitor.position = {...PRISON_EXIT}
        expect(interactPrison(visitor)).toBe('exit')
        expect(WORLD_MAP.buildings.some((building) => building.name === 'Prison de Clairbois')).toBe(true)
        expect(tileAt(WORLD_MAP, PRISON_ENTRANCE)).toBe('path')
    })
})
