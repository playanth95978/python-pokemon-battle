import type { Attack, Battle, StatStages, TurnResponse } from '../battle/types'

export const neutralStages: StatStages = { attack: 0, defense: 0, special_attack: 0, special_defense: 0, speed: 0 }

function attack(attack_slot: number, name: string, max_pp: number, category: Attack['category'] = 'physical'): Attack {
  return { attack_slot, name, pp: max_pp, max_pp, category, priority: 0, target: 'opponent' }
}

export const initialBattle: Battle = {
  id: 'battle-1', turn: 0, winner: null, is_over: false,
  first: { id: 'first', species: 'Bulbizarre', level: 50, hp: 120, max_hp: 120, potions: 2, status: null, stat_stages: neutralStages,
    attacks: [attack(0, 'Charge', 35), attack(1, 'Fouet Lianes', 25)] },
  second: { id: 'second', species: 'Salamèche', level: 50, hp: 114, max_hp: 114, potions: 2, status: null, stat_stages: neutralStages,
    attacks: [attack(0, 'Charge', 35), attack(1, 'Flammèche', 25, 'special')] },
}

export const resolvedTurn: TurnResponse = {
  battle: { ...initialBattle, turn: 1,
    first: { ...initialBattle.first, hp: 66 },
    second: { ...initialBattle.second, hp: 97,
      attacks: [{ ...initialBattle.second.attacks[0], pp: 34 }, initialBattle.second.attacks[1]] } },
  events: [
    { type: 'attack_used', turn: 1, actor: 'second', target: 'first', attack: 'Charge', pp_remaining: 34 },
    { type: 'damage_dealt', turn: 1, actor: 'second', target: 'first', damage: 54, hp_remaining: 66, effectiveness: 2 },
    { type: 'attack_missed', turn: 1, actor: 'first', target: 'second' },
  ],
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
