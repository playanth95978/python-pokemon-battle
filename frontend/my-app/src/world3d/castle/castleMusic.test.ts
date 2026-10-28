import { describe, expect, it } from 'vitest'
import type { MusicEvent } from './castleMusic'
import { ARRANGEMENTS, arrangementFor, PHRASE_LENGTH, PHRASES, renderSection } from './castleMusic'

const lead = (events: MusicEvent[]) => events.filter((event) => event.voice === 'lead' && event.pitch !== null).map((event) => event.pitch)

describe('Thème du château', () => {
  it('donne à chaque phrase exactement deux mesures, mélodie et basse', () => {
    for (const phrase of Object.values(PHRASES)) {
      expect(phrase.lead.reduce((total, [, length]) => total + length, 0)).toBe(PHRASE_LENGTH)
      expect(phrase.bass.reduce((total, [, length]) => total + length, 0)).toBe(PHRASE_LENGTH)
    }
  })

  it('change d’arrangement à chaque étage, plus enlevé en montant', () => {
    const ground = arrangementFor({floor: 0, x: 3, z: 12})
    const upper = arrangementFor({floor: 1, x: 15, z: 4})
    const summit = arrangementFor({floor: 2, x: 15, z: 12})
    const throne = arrangementFor({floor: 2, x: 5, z: 10})
    expect([ground, upper, summit, throne]).toEqual([ARRANGEMENTS.ground, ARRANGEMENTS.upper, ARRANGEMENTS.summit, ARRANGEMENTS.throne])
    expect(ground.tempo).toBeLessThan(upper.tempo)
    expect(upper.tempo).toBeLessThan(throne.tempo)
    expect(ground.sections).not.toContain('C')
  })

  it('varie d’un passage à l’autre : octave, pont en arpèges, roulement final', () => {
    const ground = ARRANGEMENTS.ground
    const first = renderSection(ground, 0, 0)
    expect(lead(renderSection(ground, 1, 0))).toEqual(lead(first).map((pitch) => pitch! + 12))
    expect(lead(renderSection(ground, 2, 0))).not.toEqual(lead(first))
    const last = ground.sections.length - 1
    const snares = (pass: number) => renderSection(ground, pass, last).filter((event) => event.voice === 'snare').length
    expect(snares(3)).toBeGreaterThan(snares(0))
  })

  it('transpose la mélodie et la basse de l’arrangement', () => {
    const upper = ARRANGEMENTS.upper
    const events = renderSection(upper, 0, 0)
    expect(lead(events)[0]).toBe(PHRASES[upper.sections[0]].lead[0][0]! + upper.transpose)
    expect(events.every((event) => event.at >= 0 && event.at < PHRASE_LENGTH)).toBe(true)
  })
})
