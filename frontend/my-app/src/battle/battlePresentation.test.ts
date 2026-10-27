import { expect, it } from 'vitest'
import { battlePresentation } from './battlePresentation'
import { initialBattle } from '../test/fixtures'
import type { BattleEvent } from './types'

const final = {...initialBattle, turn: 1, winner: 'second', first: {...initialBattle.first, hp: 0},
  second: {...initialBattle.second, attacks: [{...initialBattle.second.attacks[0], pp: 34}, initialBattle.second.attacks[1]]}}
const events: BattleEvent[] = [
  {type: 'attack_used', turn: 1, actor: 'second', target: 'first', attack: 'Nom traduit quelconque', attack_type: 'normal', attack_slot: 0, pp_remaining: 34},
  {type: 'damage_dealt', turn: 1, actor: 'second', target: 'first', damage: 120, hp_remaining: 0, effectiveness: 1},
  {type: 'knocked_out', turn: 1, fighter: 'first'},
  {type: 'battle_ended', turn: 1, winner: 'second'},
]

it('affiche les PV précédents avant impact, consomme les PP au début et attend la fin pour annoncer le vainqueur', () => {
  const before = battlePresentation(final, events, 0)
  expect(before.first.hp).toBe(120)
  expect(before.second.attacks[0].pp).toBe(35)
  const attack = battlePresentation(final, events, 1)
  expect(attack.first.hp).toBe(120)
  expect(attack.second.attacks[0].pp).toBe(34)
  expect(attack.winner).toBeNull()
  const impact = battlePresentation(final, events, 3)
  expect(impact.first.hp).toBe(0)
  expect(impact.winner).toBeNull()
  expect(battlePresentation(final, events, 4)).toBe(final)
  expect(final.first.hp).toBe(0)
  expect(final.second.attacks[0].pp).toBe(34)
})

it('présente le soin avant les dégâts et le stock au bon moment sans modifier le serveur', () => {
  const healedEvents: BattleEvent[] = [
    {type: 'potion_used', turn: 1, actor: 'first', healed: 20, hp_remaining: 70, potions_remaining: 1},
    {type: 'attack_used', turn: 1, actor: 'second', target: 'first', attack: 'Charge', pp_remaining: 34},
    {type: 'damage_dealt', turn: 1, actor: 'second', target: 'first', damage: 30, hp_remaining: 40, effectiveness: 1},
  ]
  const server = {...final, winner: null, first: {...final.first, hp: 40, potions: 1}}
  expect(battlePresentation(server, healedEvents, 0).first).toMatchObject({hp: 50, potions: 2})
  expect(battlePresentation(server, healedEvents, 1).first).toMatchObject({hp: 70, potions: 1})
  expect(battlePresentation(server, healedEvents, 3)).toBe(server)
  expect(server.first.hp).toBe(40)
  expect(server.first.potions).toBe(1)
})

it('ne rembobine pas un GET plus récent que les événements récupérés', () => {
  const newer = {...final, turn: 2}
  expect(battlePresentation(newer, events, 0)).toBe(newer)
})

it('supporte les anciens reçus sans attack_slot et les échecs sans dégâts', () => {
  const missed: BattleEvent[] = [
    {type: 'attack_used', turn: 1, actor: 'second', target: 'first', attack: 'Charge', pp_remaining: 34},
    {type: 'attack_missed', turn: 1, actor: 'second', target: 'first'},
  ]
  const snapshot = {...final, first: initialBattle.first, winner: null}
  const before = battlePresentation(snapshot, missed, 0)
  expect(before.first.hp).toBe(120)
  expect(before.second.attacks[0].pp).toBe(35)
})

it('rembobine statut, crans et brûlure puis n’annonce le match nul qu’à la fin', () => {
  const drawEvents: BattleEvent[] = [
    {type: 'attack_used', turn: 1, actor: 'first', target: 'second', attack: 'Cage-Éclair', pp_remaining: 19, attack_slot: 0},
    {type: 'status_applied', turn: 1, actor: 'first', target: 'second', condition: 'paralysis'},
    {type: 'attack_used', turn: 1, actor: 'second', target: 'second', attack: 'Danse Lames', pp_remaining: 19, attack_slot: 1},
    {type: 'stat_changed', turn: 1, actor: 'second', target: 'second', stat: 'attack', change: 2, stage: 2},
    {type: 'burn_damage', turn: 1, fighter: 'first', damage: 7, hp_remaining: 0},
    {type: 'knocked_out', turn: 1, fighter: 'first'},
    {type: 'burn_damage', turn: 1, fighter: 'second', damage: 7, hp_remaining: 0},
    {type: 'knocked_out', turn: 1, fighter: 'second'},
    {type: 'battle_ended', turn: 1, winner: null},
  ]
  const server = {...initialBattle, turn: 1, winner: null, is_over: true,
    first: {...initialBattle.first, hp: 0, status: 'burn' as const},
    second: {...initialBattle.second, hp: 0, status: 'paralysis' as const,
      stat_stages: {...initialBattle.second.stat_stages, attack: 2}}}
  const before = battlePresentation(server, drawEvents, 0)
  expect(before.second.status).toBeNull()
  expect(before.second.stat_stages.attack).toBe(0)
  expect(before.first).toMatchObject({hp: 7, status: 'burn'})
  expect(before.is_over).toBe(false)
  const afterStatus = battlePresentation(server, drawEvents, 2)
  expect(afterStatus.second.status).toBe('paralysis')
  expect(afterStatus.second.stat_stages.attack).toBe(0)
  expect(battlePresentation(server, drawEvents, 4).second.stat_stages.attack).toBe(2)
  expect(battlePresentation(server, drawEvents, 5).first.hp).toBe(0)
  expect(battlePresentation(server, drawEvents, 8).is_over).toBe(false)
  expect(battlePresentation(server, drawEvents, 9)).toBe(server)
  expect(server.second.stat_stages.attack).toBe(2)
})
