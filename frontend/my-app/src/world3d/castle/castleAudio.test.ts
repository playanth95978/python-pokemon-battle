import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCastleAudio, surfaceAt } from './castleAudio'
import { enterCastle, STAIRS } from './castleLayout'

afterEach(() => vi.unstubAllGlobals())

/** Contexte audio factice : chaque nœud se chaîne comme dans Web Audio et l'on compte les sons démarrés. */
function installAudio() {
  const parameter = () => ({value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn()})
  const started: number[] = []
  const node = () => {
    const created = {
      connect: vi.fn((target: unknown) => target), disconnect: vi.fn(), start: vi.fn((at = 0) => { started.push(at) }), stop: vi.fn(),
      gain: parameter(), frequency: parameter(), Q: parameter(), delayTime: parameter(), type: '', buffer: null, loop: false,
      getChannelData: () => new Float32Array(16),
    }
    return created
  }
  const context = {
    state: 'running', currentTime: 10, sampleRate: 8, destination: node(),
    resume: vi.fn().mockResolvedValue(undefined), suspend: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn(node), createOscillator: vi.fn(node), createBufferSource: vi.fn(node), createBiquadFilter: vi.fn(node),
    createConvolver: vi.fn(node), createBuffer: vi.fn(node), createDelay: vi.fn(node),
  }
  vi.stubGlobal('AudioContext', class { constructor() { return context } })
  return {context, started}
}

describe('Bruitages du château', () => {
  it('choisit le bruit des pas selon le sol de la pièce', () => {
    expect(surfaceAt({floor: 0, x: 3, z: 12})).toBe('stone')
    expect(surfaceAt({floor: 0, x: 14, z: 4})).toBe('wood')
    expect(surfaceAt({floor: 2, x: 15, z: 12})).toBe('marble')
  })

  it('joue cinq marches dans l’escalier et se tait hors du château', () => {
    const {started} = installAudio()
    const audio = createCastleAudio()
    audio.enter()
    const stairs = STAIRS[0]
    const before = started.length
    audio.play({type: 'stairs', stairs}, {...enterCastle(), ...stairs.to})
    // Chaque marche : un souffle et un coup sourd, plus le souffle de la cage d'escalier.
    expect(started.length - before).toBe(5 * 2 + 1)
    audio.leave()
    const after = started.length
    audio.play({type: 'moved'}, enterCastle())
    expect(started.length).toBe(after)
  })

  it('joue le thème de l’étage dans le château et se tait pendant un combat', () => {
    const {context, started} = installAudio()
    const audio = createCastleAudio()
    audio.enter()
    const before = started.length
    // Entrée : la première phrase démarre 0,4 s plus tard ; elle est programmée dès qu'elle approche.
    context.currentTime = 10.2
    audio.update(enterCastle(), false)
    // Une phrase complète : mélodie, basse et batterie (une quarantaine de sons).
    expect(started.length - before).toBeGreaterThanOrEqual(30)
    const playing = started.length
    audio.update(enterCastle(), true)
    context.currentTime = 30
    audio.update(enterCastle(), true)
    expect(started.length).toBe(playing)
  })
})
