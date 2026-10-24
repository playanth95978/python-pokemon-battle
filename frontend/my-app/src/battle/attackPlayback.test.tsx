import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ATTACK_DURATION, attackClips, effectKind } from './attackPlayback'
import { useAttackPlayback } from './useAttackPlayback'
import type { BattleEvent } from './types'

const events: BattleEvent[] = [
  { type: 'attack_used', turn: 1, actor: 'a', target: 'b', attack: 'Flammèche', pp_remaining: 24, attack_type: 'fire', attack_slot: 1 },
  { type: 'damage_dealt', turn: 1, actor: 'a', target: 'b', damage: 12, hp_remaining: 88, effectiveness: 2 },
  { type: 'attack_used', turn: 1, actor: 'b', target: 'a', attack: 'Pistolet à O', pp_remaining: 24, attack_type: 'water', attack_slot: 1 },
  { type: 'attack_missed', turn: 1, actor: 'b', target: 'a' },
]
afterEach(() => vi.useRealTimers())

it('associe les effets aux types stables, indépendamment du nom traduit', () => {
  expect(['fire', 'water', 'grass', 'normal', 'electric'].map(effectKind)).toEqual(['fire', 'water', 'vine', 'charge', 'electric'])
  expect(attackClips([{...events[0], attack: 'Ember'} as BattleEvent, events[1]])[0].kind).toBe('fire')
  expect(effectKind(undefined)).toBe('charge')
})

it('suit les résultats serveur sans inventer une réussite ou une riposte après KO', () => {
  expect(attackClips(events).map((clip) => [clip.actor, clip.kind, clip.outcome])).toEqual([
    ['a', 'fire', 'hit'], ['b', 'water', 'miss'],
  ])
  const ko: BattleEvent[] = [...events.slice(0, 2), { type: 'knocked_out', turn: 1, fighter: 'b' },
    { type: 'battle_ended', turn: 1, winner: 'a' }]
  expect(attackClips(ko)).toHaveLength(1)
  expect(attackClips([{ type: 'attack_used', turn: 1, actor: 'a', target: 'b', attack: 'Charge', pp_remaining: 1 }])).toEqual([])
})

it('distingue une immunité d’un impact', () => {
  const immune: BattleEvent[] = [events[0], { type: 'damage_dealt', turn: 1, actor: 'a', target: 'b', damage: 0, hp_remaining: 100, effectiveness: 0 }]
  expect(attackClips(immune)[0].outcome).toBe('immune')
})

it('révèle le KO à impact et la victoire seulement après la dernière animation', () => {
  vi.useFakeTimers()
  Object.defineProperty(window, 'matchMedia', {configurable: true, value: () => ({matches: false, addEventListener() {}, removeEventListener() {}})})
  const ko: BattleEvent[] = [...events.slice(0, 2), {type: 'knocked_out', turn: 1, fighter: 'b'}, {type: 'battle_ended', turn: 1, winner: 'a'}]
  const {result, unmount} = renderHook(() => useAttackPlayback(ko, true))
  expect(result.current.revealedCount).toBe(1)
  act(() => vi.advanceTimersByTime(748))
  expect(result.current.revealedCount).toBe(3)
  expect(result.current.isPlaying).toBe(true)
  act(() => vi.advanceTimersByTime(402))
  expect(result.current.revealedCount).toBe(4)
  expect(result.current.isPlaying).toBe(false)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('joue les attaques dans l’ordre, puis ne rejoue pas les événements déjà affichés', () => {
  vi.useFakeTimers()
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  const { result, rerender } = renderHook(({ data }) => useAttackPlayback(data, true), { initialProps: { data: events } })
  expect(result.current.active?.actor).toBe('a')
  expect(result.current.revealedCount).toBe(1)
  act(() => vi.advanceTimersByTime(ATTACK_DURATION * 0.65))
  expect(result.current.revealedCount).toBe(2)
  act(() => vi.advanceTimersByTime(ATTACK_DURATION * 0.35))
  expect(result.current.active?.actor).toBe('b')
  act(() => vi.advanceTimersByTime(ATTACK_DURATION))
  expect(result.current.isPlaying).toBe(false)
  rerender({ data: [...events] })
  expect(result.current.isPlaying).toBe(false)
})

it('ignore les animations avec mouvements réduits et ne rejoue pas l’historique après réactivation', () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(({ enabled }) => useAttackPlayback(events, enabled), { initialProps: { enabled: false } })
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.active).toBeNull()
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  // Le préférence initiale réduite reste respectée ; le toggle ne la contourne pas.
  rerender({ enabled: true })
  expect(result.current.active).toBeNull()
})
