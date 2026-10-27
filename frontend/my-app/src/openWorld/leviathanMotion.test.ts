import { describe, expect, it } from 'vitest'
import {
  BODY_LENGTH,
  canChallenge,
  createLeviathanState,
  ENCOUNTER_RANGE,
  isDeepWater,
  PHASE_DURATION,
  rearAmount,
  spinePoints,
  stepLeviathan
} from './leviathanMotion'
import { createWorldGenerator } from './worldGenerator'

const world = createWorldGenerator(42)
/** Rivière au sud du départ de la graine 42, là où le Léviathan a son repaire. */
const HOME = {x: 5258, z: 5839}
const FAR = {x: 0, z: 0}

describe('Léviathan du monde ouvert', () => {
  it('commence et reste dans l’eau profonde en patrouillant autour de son repaire', () => {
    const state = createLeviathanState(world, HOME)!
    expect(isDeepWater(world, state.x, state.z)).toBe(true)
    for (let frame = 0; frame < 60 * 30; frame++) {
      stepLeviathan(world, state, 1 / 30, FAR)
      expect(isDeepWater(world, state.x, state.z)).toBe(true)
    }
    expect(Math.hypot(state.x - state.home.x, state.z - state.home.z)).toBeLessThan(120)
    expect(state.phase).toBe('swim')
  })

  it('se dresse face au dresseur, attaque, replonge puis attend avant d’attaquer encore', () => {
    const state = createLeviathanState(world, HOME)!
    state.cooldown = 0
    const player = {x: state.x + 6, z: state.z}
    stepLeviathan(world, state, 1 / 30, player)
    expect(state.phase).toBe('rear')
    expect(state.attack).toBe('Hydrocanon')
    const phases = new Set<string>()
    for (let time = 0; time < PHASE_DURATION.rear + PHASE_DURATION.attack + PHASE_DURATION.dive + 0.2; time += 1 / 30) {
      stepLeviathan(world, state, 1 / 30, player)
      phases.add(state.phase)
    }
    expect([...phases]).toEqual(['rear', 'attack', 'dive', 'swim'])
    expect(Math.abs(Math.atan2(Math.sin(state.heading - Math.PI / 2), Math.cos(state.heading - Math.PI / 2)))).toBeLessThan(0.4)
    stepLeviathan(world, state, 1 / 30, player)
    expect(state.phase).toBe('swim')
    expect(state.attack).toBeNull()
  })

  it('alterne ses attaques et se redresse progressivement', () => {
    const state = createLeviathanState(world, HOME)!
    const player = {x: state.x + 4, z: state.z}
    const seen: (string | null)[] = []
    for (let round = 0; round < 2; round++) {
      state.cooldown = 0
      stepLeviathan(world, state, 1 / 30, player)
      seen.push(state.attack)
      expect(rearAmount(state)).toBeLessThan(0.1)
      while (state.phase !== 'swim') stepLeviathan(world, state, 1 / 30, player)
    }
    expect(seen).toEqual(['Hydrocanon', 'Ouragan'])
  })

  it('ne peut être affronté qu’à quelques cases de sa tête, depuis la berge', () => {
    const state = createLeviathanState(world, HOME)!
    expect(canChallenge(state, {x: state.x + ENCOUNTER_RANGE - 0.5, z: state.z})).toBe(true)
    expect(canChallenge(state, {x: state.x + ENCOUNTER_RANGE + 0.5, z: state.z})).toBe(false)
  })

  it('aligne le corps sur la trace de la tête, à distance régulière', () => {
    const state = createLeviathanState(world, HOME)!
    for (let frame = 0; frame < 30 * 8; frame++) stepLeviathan(world, state, 1 / 30, FAR)
    const spine = spinePoints(state, 27)
    expect(spine).toHaveLength(27)
    expect(spine[0]).toEqual({x: state.x, z: state.z})
    const lengths = spine.slice(1).map((point, index) => Math.hypot(point.x - spine[index].x, point.z - spine[index].z))
    for (const length of lengths) expect(length).toBeLessThanOrEqual(BODY_LENGTH / 26 + 1e-6)
    expect(lengths.reduce((sum, length) => sum + length, 0)).toBeGreaterThan(BODY_LENGTH * 0.9)
  })
})
