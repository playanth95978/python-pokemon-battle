import { describe, expect, it } from 'vitest'
import { cutTriangles, dominantBones, pickSeveredLimb } from './dismemberment'

const joints = {
    head: {x: 0, y: 1.4, z: 0}, armL: {x: 0.2, y: 1.25, z: 0}, armR: {x: -0.2, y: 1.25, z: 0},
    thighL: {x: 0.1, y: 0.85, z: 0}, shinL: {x: 0.1, y: 0.45, z: 0},
}

describe('Démembrement', () => {
    it('tranche le membre dont l’articulation est la plus proche du coup', () => {
        expect(pickSeveredLimb({x: 0, y: 1.5, z: 0.1}, joints)).toBe('head')
        expect(pickSeveredLimb({x: -0.3, y: 1.2, z: 0}, joints)).toBe('armR')
        expect(pickSeveredLimb({x: 0.1, y: 0.4, z: 0.1}, joints)).toBe('shinL')
    })

    it('ne retranche pas un membre déjà coupé', () => {
        expect(pickSeveredLimb({x: 0, y: 1.5, z: 0}, joints, ['head'])).not.toBe('head')
    })

    it('garde les triangles d’un seul côté de la coupure et retire ceux qui la chevauchent', () => {
        // Sommets 0 à 2 : corps ; 3 à 5 : membre. Le triangle 1-2-3 est à cheval.
        const owner = [false, false, false, true, true, true]
        expect(cutTriangles([0, 1, 2, 3, 4, 5, 1, 2, 3], owner)).toEqual([0, 1, 2, 3, 4, 5])
    })

    it('rattache chaque sommet à l’os qui pèse le plus sur lui', () => {
        const index = [4, 7, 0, 0, 2, 9, 0, 0]
        const weight = [0.3, 0.7, 0, 0, 0.9, 0.1, 0, 0]
        expect([...dominantBones(index, weight, 2)]).toEqual([7, 2])
    })
})
