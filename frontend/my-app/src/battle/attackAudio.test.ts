import { afterEach, expect, it, vi } from 'vitest'
import { createAttackAudio } from './attackAudio'
import { ATTACK_DURATION } from './attackPlayback'
import type { AttackClip } from './attackPlayback'

afterEach(() => vi.unstubAllGlobals())
function installAudio() {
  const parameter = () => ({value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn()})
  const node = () => ({connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: parameter(), frequency: parameter(), Q: parameter(), getChannelData: () => new Float32Array(100)})
  const sources: ReturnType<typeof node>[] = []
  const source = () => {const created = node(); sources.push(created); return created}
  const context = {state: 'running', currentTime: 10, sampleRate: 8000, destination: {}, resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined), createGain: vi.fn(node), createOscillator: vi.fn(source), createBufferSource: vi.fn(source), createBiquadFilter: vi.fn(node), createBuffer: vi.fn(node)}
  vi.stubGlobal('AudioContext', class {constructor() {return context}})
  return {context, sources}
}
const clip: AttackClip = {id: '1-0', actor: 'a', target: 'b', name: 'Éclair', kind: 'electric', outcome: 'hit'}

it('synchronise la décharge et le bruit d’impact sur le même clip que les effets visuels', () => {
  const {context, sources} = installAudio(), audio = createAttackAudio()
  audio.play(clip)
  expect(sources).toHaveLength(5)
  expect(sources[1].start).toHaveBeenCalledWith(10.015 + ATTACK_DURATION / 1000 * 0.22)
  expect(sources[3].start).toHaveBeenCalledWith(10.015 + ATTACK_DURATION / 1000 * 0.65)
  audio.dispose()
  expect(sources.every((source) => source.disconnect.mock.calls.length === 1)).toBe(true)
  expect(context.close).toHaveBeenCalledOnce()
})

it.each(['miss', 'immune'] as const)('n’ajoute pas de bruit d’impact sur un résultat %s', (outcome) => {
  const {sources} = installAudio(), audio = createAttackAudio()
  audio.play({...clip, outcome})
  expect(sources).toHaveLength(3)
  audio.stop()
  expect(sources.every((source) => source.stop.mock.calls.length === 2)).toBe(true)
  audio.dispose()
})
