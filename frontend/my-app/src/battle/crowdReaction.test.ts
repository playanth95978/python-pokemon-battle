import { expect, it } from 'vitest'
import { crowdReaction } from './crowdReaction'
import { initialBattle } from '../test/fixtures'
import type { AttackClip } from './attackPlayback'

const active: AttackClip = {id: '1-0', actor: 'first', target: 'second', name: 'Charge', kind: 'charge', outcome: 'hit'}

it('attend l’impact avant d’applaudir et suit le résultat de l’attaque', () => {
  expect(crowdReaction(initialBattle, null, false)).toBe('watching')
  expect(crowdReaction(initialBattle, active, false)).toBe('anticipation')
  expect(crowdReaction(initialBattle, active, true)).toBe('cheer')
  expect(crowdReaction(initialBattle, {...active, outcome: 'miss'}, true)).toBe('miss')
  expect(crowdReaction(initialBattle, {...active, outcome: 'immune'}, true)).toBe('immune')
})

it('distingue le KO affiché puis la victoire sans inventer un vainqueur', () => {
  const knockedOut = {...initialBattle, second: {...initialBattle.second, hp: 0}}
  expect(crowdReaction(knockedOut, active, false)).toBe('anticipation')
  expect(crowdReaction(knockedOut, active, true)).toBe('knockout')
  expect(crowdReaction({...knockedOut, winner: 'first', is_over: true}, null, false)).toBe('victory')
})

it('réagit à un match nul et à une attaque bloquée', () => {
  const draw = {...initialBattle, is_over: true, first: {...initialBattle.first, hp: 0}, second: {...initialBattle.second, hp: 0}}
  expect(crowdReaction(draw, null, false)).toBe('draw')
  expect(crowdReaction(initialBattle, {...active, outcome: 'blocked'}, true)).toBe('immune')
})
