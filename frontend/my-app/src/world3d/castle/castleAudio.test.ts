import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCastleAudio, heartbeatInterval, surfaceAt, tensionAt } from './castleAudio'
import { BOSS, enterCastle, STAIRS } from './castleLayout'

afterEach(() => vi.unstubAllGlobals())

/** Contexte audio factice : chaque nœud se chaîne comme dans Web Audio et l'on compte les sons démarrés. */
function installAudio() {
  const parameter = () => ({value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn()})
  const started: number[] = []
  const node = () => {
    const created = {
      connect: vi.fn((target: unknown) => target), disconnect: vi.fn(), start: vi.fn((at = 0) => { started.push(at) }), stop: vi.fn(),
      gain: parameter(), frequency: parameter(), Q: parameter(), type: '', buffer: null, loop: false,
      getChannelData: () => new Float32Array(16),
    }
    return created
  }
  const context = {
    state: 'running', currentTime: 10, sampleRate: 8, destination: node(),
    resume: vi.fn().mockResolvedValue(undefined), suspend: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn(node), createOscillator: vi.fn(node), createBufferSource: vi.fn(node), createBiquadFilter: vi.fn(node),
    createConvolver: vi.fn(node), createBuffer: vi.fn(node),
  }
  vi.stubGlobal('AudioContext', class { constructor() { return context } })
  return {context, started}
}

describe('Ambiance sonore du château', () => {
  it('fait monter la tension d’étage en étage jusqu’à Mewtwo', () => {
    const hall = tensionAt({floor: 0, x: 3, z: 12})
    const treasury = tensionAt({floor: 1, x: 15, z: 12})
    const antechamber = tensionAt({floor: 2, x: 15, z: 12})
    const throneDoor = tensionAt({floor: 2, x: 10, z: 12})
    const facingBoss = tensionAt({floor: 2, x: BOSS.x, z: BOSS.z + 2})
    expect(hall).toBeLessThan(treasury)
    expect(treasury).toBeLessThan(antechamber)
    expect(antechamber).toBeLessThan(throneDoor)
    expect(throneDoor).toBeLessThan(facingBoss)
    expect(facingBoss).toBeLessThanOrEqual(1)
  })

  it('ne fait battre le cœur qu’au sommet, de plus en plus vite près de Mewtwo', () => {
    expect(heartbeatInterval(tensionAt({floor: 1, x: 15, z: 12}))).toBeNull()
    const far = heartbeatInterval(tensionAt({floor: 2, x: 15, z: 12}))!
    const near = heartbeatInterval(tensionAt({floor: 2, x: BOSS.x, z: BOSS.z + 2}))!
    expect(near).toBeLessThan(far)
    expect(near).toBeGreaterThan(0.5)
  })

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
})
