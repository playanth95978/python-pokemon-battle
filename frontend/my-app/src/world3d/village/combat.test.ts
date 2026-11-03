import { describe, expect, it } from 'vitest'
import type { Target } from './combat'
import { aimAt, createLife, isDead, passTime, REVIVE_HOURS, strike, weaponById } from './combat'

const target = (id: string, x: number, y: number, maxHealth = 40): Target => ({id, kind: 'villager', name: id, x, y, maxHealth})
const SOUTH = {x: 0, y: 1}
const origin = {x: 0.5, y: 0.5}

describe('Armes du dresseur', () => {
    it('vise l’être le plus proche devant soi, pas celui qui est derrière', () => {
        const targets = [target('derriere', 0.5, -0.5), target('loin', 0.5, 2.3), target('proche', 0.5, 1.5)]
        expect(aimAt(createLife(), weaponById('sword'), origin, SOUTH, targets)?.id).toBe('proche')
    })

    it('ne touche à l’épée que ce qui est à portée de lame, mais atteint de loin à l’arc', () => {
        const far = [target('loin', 0.5, 9.5)]
        expect(aimAt(createLife(), weaponById('sword'), origin, SOUTH, far)).toBeNull()
        expect(aimAt(createLife(), weaponById('bow'), origin, SOUTH, far)?.id).toBe('loin')
    })

    it('demande à l’arc de viser juste : une cible décalée de côté est manquée', () => {
        expect(aimAt(createLife(), weaponById('bow'), origin, SOUTH, [target('cote', 3.5, 6.5)])).toBeNull()
    })

    it('touche au poing un voisin collé en diagonale', () => {
        expect(aimAt(createLife(), weaponById('fists'), origin, SOUTH, [target('diagonale', 1.3, 1.3)])?.id).toBe('diagonale')
    })

    it('retire des points de vie à chaque coup, puis tue à zéro', () => {
        const life = createLife(), victim = target('aldric', 0.5, 1.5, 40), sword = weaponById('sword')
        expect(strike(life, sword, victim)).toMatchObject({damage: 30, health: 10, killed: false})
        expect(strike(life, sword, victim)).toMatchObject({health: 0, killed: true})
        expect(isDead(life, 'aldric')).toBe(true)
        expect(strike(life, sword, victim)).toBeNull()
        expect(aimAt(life, sword, origin, SOUTH, [victim])).toBeNull()
    })

    it('ramène les morts à la vie, en pleine forme, après quelques heures de jeu', () => {
        const life = createLife(), victim = target('rose', 0.5, 1.5, 40)
        strike(life, weaponById('bow'), victim)
        strike(life, weaponById('bow'), victim)
        expect(passTime(life, REVIVE_HOURS - 1)).toEqual([])
        expect(passTime(life, 1)).toEqual(['rose'])
        expect(isDead(life, 'rose')).toBe(false)
        expect(strike(life, weaponById('fists'), victim)?.health).toBe(32)
    })
})
