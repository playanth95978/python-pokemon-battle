import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useBattleAudio } from './useBattleAudio'
import { createAttackAudio } from './attackAudio'
import type { AttackClip } from './attackPlayback'

vi.mock('./attackAudio', () => ({createAttackAudio: vi.fn()}))
afterEach(() => {vi.resetAllMocks(); vi.unstubAllGlobals()})
const clip: AttackClip = {id: '1-0', actor: 'a', target: 'b', name: 'Éclair', kind: 'electric', outcome: 'hit'}
const create = () => ({resume: vi.fn().mockResolvedValue(undefined), play: vi.fn(), stop: vi.fn(), setVolume: vi.fn(), dispose: vi.fn()})

it('attend un clic pour créer le contexte, ne rejoue pas un clip au changement de volume et coupe au démontage', async () => {
  const audio = create(); vi.mocked(createAttackAudio).mockReturnValue(audio)
  const {result, rerender, unmount} = renderHook(({active}) => useBattleAudio(active), {initialProps: {active: null as AttackClip | null}})
  expect(createAttackAudio).not.toHaveBeenCalled()
  await act(() => result.current.toggle())
  expect(result.current.enabled).toBe(true)
  expect(audio.resume).toHaveBeenCalledOnce()
  rerender({active: clip})
  expect(audio.play).toHaveBeenCalledExactlyOnceWith(clip)
  act(() => result.current.setVolume(0.1))
  expect(audio.setVolume).toHaveBeenLastCalledWith(0.1)
  expect(audio.play).toHaveBeenCalledOnce()
  await act(() => result.current.toggle())
  expect(result.current.enabled).toBe(false)
  expect(audio.stop).toHaveBeenCalled()
  unmount(); expect(audio.dispose).toHaveBeenCalledOnce()
})

it('ne démarre pas au milieu d’une attaque et n’émet pas de son dans un onglet masqué', async () => {
  const audio = create(); vi.mocked(createAttackAudio).mockReturnValue(audio)
  const {result, rerender} = renderHook(({active}) => useBattleAudio(active), {initialProps: {active: clip}})
  await act(() => result.current.toggle())
  expect(audio.play).not.toHaveBeenCalled()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  rerender({active: {...clip, id: '1-2'}})
  expect(audio.play).not.toHaveBeenCalled()
  expect(audio.stop).toHaveBeenCalled()
  vi.restoreAllMocks()
})

it('garde le combat utilisable quand Web Audio est indisponible', async () => {
  vi.mocked(createAttackAudio).mockImplementation(() => {throw new Error('indisponible')})
  const {result} = renderHook(() => useBattleAudio(null))
  await act(() => result.current.toggle())
  expect(result.current.enabled).toBe(false)
  expect(result.current.error).toContain('son est indisponible')
})
