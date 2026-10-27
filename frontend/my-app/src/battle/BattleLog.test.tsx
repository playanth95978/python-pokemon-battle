import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { BattleLog } from './BattleLog'
import { initialBattle } from '../test/fixtures'
import type { BattleEvent } from './types'

it('raconte les statuts, les crans, la protection et le match nul', () => {
  const events: BattleEvent[] = [
    {type: 'status_applied', turn: 1, actor: 'first', target: 'second', condition: 'paralysis'},
    {type: 'fully_paralyzed', turn: 1, actor: 'second'},
    {type: 'stat_changed', turn: 1, actor: 'first', target: 'first', stat: 'attack', change: 2, stage: 2},
    {type: 'stat_changed', turn: 1, actor: 'first', target: 'second', stat: 'speed', change: -1, stage: -1},
    {type: 'protection_activated', turn: 2, actor: 'second'},
    {type: 'attack_blocked', turn: 2, actor: 'first', target: 'second'},
    {type: 'effect_failed', turn: 2, actor: 'first', target: 'second', reason: 'already_has_status'},
    {type: 'effect_failed', turn: 2, actor: 'second', target: 'second', reason: 'stat_limit', stat: 'attack', stage: 6},
    {type: 'effect_failed', turn: 2, actor: 'first', target: 'second', reason: 'stat_limit', stat: 'speed', stage: -6},
    {type: 'burn_damage', turn: 2, fighter: 'first', damage: 7, hp_remaining: 0},
    {type: 'battle_ended', turn: 2, winner: null},
  ]
  render(<BattleLog events={events} battle={initialBattle}/>)
  const lines = screen.getAllByRole('listitem').map((item) => item.textContent)
  expect(lines).toEqual([
    'Tour 1Salamèche (2) est paralysé.',
    'Tour 1Salamèche (2) est paralysé et ne peut pas agir.',
    'Tour 1L’attaque de Bulbizarre (1) augmente fortement (cran +2).',
    'Tour 1La vitesse de Salamèche (2) baisse (cran -1).',
    'Tour 2Salamèche (2) se protège.',
    'Tour 2Salamèche (2) bloque l’attaque.',
    'Tour 2Salamèche (2) a déjà un statut : sans effet.',
    'Tour 2L’attaque de Salamèche (2) ne peut plus monter.',
    'Tour 2La vitesse de Salamèche (2) ne peut plus baisser.',
    'Tour 2Bulbizarre (1) souffre de sa brûlure et perd 7 PV (0 restants).',
    'Tour 2Match nul : les deux combattants sont K.O.',
  ])
})
