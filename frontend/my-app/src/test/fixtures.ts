import type { Battle, TurnResponse } from '../battle/types'

export const initialBattle: Battle = {
  id: 'battle-1', turn: 0, winner: null,
  first: { id: 'first', species: 'Bulbizarre', level: 50, hp: 120, max_hp: 120, potions: 2,
    attacks: [{ attack_slot: 0, name: 'Charge', pp: 35, max_pp: 35 }, { attack_slot: 1, name: 'Fouet Lianes', pp: 25, max_pp: 25 }] },
  second: { id: 'second', species: 'Salamèche', level: 50, hp: 114, max_hp: 114, potions: 2,
    attacks: [{ attack_slot: 0, name: 'Charge', pp: 35, max_pp: 35 }, { attack_slot: 1, name: 'Flammèche', pp: 25, max_pp: 25 }] },
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
