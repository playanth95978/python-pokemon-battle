import { describe, expect, it } from 'vitest'
import { strike, weaponById } from './combat'
import { createGuardDuel, duelHealth, guardWasHit, updateGuardDuel, type DuelWorld, type GuardDuel } from './guardDuel'

const world: DuelWorld = {player: {x: 5.5, y: 5.5}, passable: ({x, y}) => x >= 0 && y >= 0 && x < 20 && y < 20, blocksSight: () => false}
function simulate(duel: GuardDuel, seconds: number, environment = world) {
    const events = []
    for (let time = 0; time < seconds; time += 0.05) events.push(...updateGuardDuel(duel, 0.05, environment))
    return events
}
describe('Duel avec un garde à pied', () => {
    it('réutilise les dégâts des armes et ne produit la victoire qu’une fois', () => {
        const duel = createGuardDuel('police', {x: 6.5, y: 5.5})
        strike(duel.life, weaponById('bow'), duel.opponent)
        guardWasHit(duel)
        expect(duelHealth(duel, 'opponent')).toBe(35)
        expect(duelHealth(duel, 'player')).toBe(100)
        strike(duel.life, weaponById('bow'), duel.opponent)
        expect(updateGuardDuel(duel, 0.05, world)).toEqual([{type: 'won'}])
        expect(duelHealth(duel, 'opponent')).toBe(0)
        expect(simulate(duel, 10)).toEqual([])
    })

    it('annonce le coup avant les dégâts et laisse le joueur esquiver', () => {
        const duel = createGuardDuel('warden', {x: 6.5, y: 5.5})
        simulate(duel, 1.1)
        expect(duel.windup).toBeGreaterThan(0)
        expect(duelHealth(duel, 'player')).toBe(100)
        const events = simulate(duel, 0.7, {...world, player: {x: 11.5, y: 5.5}})
        expect(events).toEqual([])
        expect(duelHealth(duel, 'player')).toBe(100)
    })

    it('peut vaincre le joueur, puis cesse de lui infliger des dégâts', () => {
        const duel = createGuardDuel('warden', {x: 6.5, y: 5.5})
        const events = simulate(duel, 20)
        expect(events.filter((event) => event.type === 'lost')).toHaveLength(1)
        expect(duel.result).toBe('lost')
        expect(duelHealth(duel, 'player')).toBe(0)
        expect(simulate(duel, 20)).toEqual([])
    })

    it('ne frappe pas au travers d’un mur et respecte les pauses', () => {
        const duel = createGuardDuel('warden', {x: 6.5, y: 5.5})
        simulate(duel, 4, {...world, blocksSight: () => true})
        expect(duelHealth(duel, 'player')).toBe(100)
        const before = structuredClone(duel)
        updateGuardDuel(duel, 0, world)
        expect(duel).toEqual(before)
    })

    it('permet de rompre un duel de police en fuyant, sans donner les clés du geôlier', () => {
        const duel = createGuardDuel('police', {x: 1.5, y: 1.5})
        expect(updateGuardDuel(duel, 0.05, {...world, player: {x: 19, y: 19}})).toEqual([{type: 'fled'}])
        const warden = createGuardDuel('warden', {x: 1.5, y: 1.5})
        expect(updateGuardDuel(warden, 0.05, {...world, player: {x: 19, y: 19}})).toEqual([])
        expect(warden.result).toBeNull()
    })
})
