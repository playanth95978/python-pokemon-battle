import { describe, expect, it } from 'vitest'
import type { CastleState } from './castleLayout'
import { BASE_LEVEL, BASE_POTIONS, battleBonus, capturesBoss, describeBonus, GHOST_CHANCE, GHOST_COOLDOWN, GHOSTS, ghostEncounter } from './castleQuest'

const hall: CastleState = {floor: 0, x: 3, z: 12, facing: 'right', inventory: [], opened: []}

describe('Quête du château', () => {
  it('ne change rien au combat avec un sac vide', () => {
    expect(battleBonus([])).toEqual({first_level: BASE_LEVEL, first_potions: BASE_POTIONS})
    expect(describeBonus(battleBonus([]))).toBe('')
  })

  it('ajoute des potions pour chaque soin ramassé et des niveaux pour le Super Bonbon', () => {
    const bonus = battleBonus(['potion', 'super-potion', 'elixir', 'rare-candy', 'silver-key'])
    expect(bonus).toEqual({first_level: BASE_LEVEL + 5, first_potions: BASE_POTIONS + 4})
    expect(describeBonus(bonus)).toBe(`Grâce à ton sac : niveau ${BASE_LEVEL + 5}, ${BASE_POTIONS + 4} potions.`)
  })

  it('plafonne les potions à ce que le serveur accepte', () => {
    expect(battleBonus(['potion', 'super-potion', 'hyper-potion', 'max-potion', 'elixir', 'elixir', 'elixir']).first_potions).toBe(9)
  })

  it('fait surgir un spectre seulement après quelques pas, aux étages hantés', () => {
    const lucky = GHOST_CHANCE / 2
    expect(ghostEncounter(hall, GHOST_COOLDOWN - 1, lucky, 0)).toBeNull()
    expect(ghostEncounter(hall, GHOST_COOLDOWN, lucky, 0)).toBe(GHOSTS[0])
    expect(ghostEncounter(hall, GHOST_COOLDOWN, GHOST_CHANCE, 0)).toBeNull()
    expect(ghostEncounter(hall, GHOST_COOLDOWN, lucky, 0.999)).toBe(GHOSTS.at(-1))
    expect(ghostEncounter({...hall, floor: 2, x: 15, z: 12}, GHOST_COOLDOWN, lucky, 0)).toBeNull()
  })

  it('capture Mewtwo seulement avec la Master Ball', () => {
    expect(capturesBoss(['gold-key', 'master-ball'])).toBe(true)
    expect(capturesBoss(['gold-key'])).toBe(false)
  })
})
