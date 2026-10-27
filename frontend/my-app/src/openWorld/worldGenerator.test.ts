import { describe, expect, it } from 'vitest'
import { createNoise2D, fbm } from './noise'
import { createWorldGenerator, MAX_STEP_HEIGHT, SEA_LEVEL, WORLD_SIZE } from './worldGenerator'

describe('Bruit procédural', () => {
  it('donne les mêmes valeurs pour la même graine et d’autres pour une autre graine', () => {
    const first = createNoise2D(7), again = createNoise2D(7), other = createNoise2D(8)
    expect(first(12.3, 45.6)).toBe(again(12.3, 45.6))
    expect(first(12.3, 45.6)).not.toBe(other(12.3, 45.6))
  })

  it('reste dans l’intervalle [-1, 1]', () => {
    const noise = createNoise2D(3)
    for (let index = 0; index < 2000; index++) {
      const value = fbm(noise, index * 0.37, index * 0.91, 5)
      expect(Math.abs(value)).toBeLessThanOrEqual(1)
    }
  })
})

describe('Générateur du monde ouvert', () => {
  const world = createWorldGenerator(42)

  it('recrée exactement le même monde à partir de la même graine', () => {
    const again = createWorldGenerator(42)
    for (const [x, y] of [[0, 0], [1234, 5678], [5000, 5000], [9999, 42]]) expect(again.sample(x, y)).toEqual(world.sample(x, y))
  })

  it('entoure le monde d’océan pour qu’on n’en atteigne jamais le bord à pied', () => {
    for (let index = 0; index < WORLD_SIZE; index += 250) {
      for (const [x, y] of [[index, 5], [5, index], [index, WORLD_SIZE - 5], [WORLD_SIZE - 5, index]]) {
        expect(world.sample(x, y).height).toBeLessThan(SEA_LEVEL)
      }
    }
  })

  it('contient des paysages variés : mer, plaines, forêts, déserts, montagnes et neige', () => {
    const biomes = new Set<string>()
    for (let y = 0; y < WORLD_SIZE; y += 100) for (let x = 0; x < WORLD_SIZE; x += 100) biomes.add(world.sample(x, y).biome)
    for (const biome of ['deep_water', 'plains', 'forest', 'desert', 'mountain', 'snow', 'river']) expect(biomes).toContain(biome)
  })

  it('fait apparaître le joueur sur une plaine d’où il peut marcher dans les quatre directions', () => {
    const spawn = world.findSpawn()
    expect(world.sample(spawn.x + 0.5, spawn.y + 0.5).biome).toBe('plains')
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(world.canWalk(spawn, {x: spawn.x + dx, y: spawn.y + dy})).toBe(true)
  })

  it('interdit l’eau, les pentes trop raides et la sortie du monde', () => {
    const water = {x: 3, y: 3}
    expect(world.canWalk({x: 4, y: 3}, water)).toBe(false)
    expect(world.canWalk({x: 0, y: 0}, {x: -1, y: 0})).toBe(false)
    // Cherche une falaise : deux cases voisines dont le dénivelé dépasse la limite.
    let cliff: { x: number; y: number } | null = null
    for (let x = 4000; x < 6000 && !cliff; x++) {
      for (let y = 4000; y < 6000 && !cliff; y += 3) {
        const here = world.height(x + 0.5, y + 0.5), next = world.height(x + 1.5, y + 0.5)
        if (here > SEA_LEVEL && next - here > MAX_STEP_HEIGHT) cliff = {x, y}
      }
    }
    expect(cliff).not.toBeNull()
    expect(world.canWalk(cliff!, {x: cliff!.x + 1, y: cliff!.y})).toBe(false)
  })
})
