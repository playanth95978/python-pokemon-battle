import { describe, expect, it } from 'vitest'
import { blocksMovement, buildGrassData, buildVegetationData, FAR_SPECIES, plantAt, writeMatrix } from './vegetation'
import { createWorldGenerator } from './worldGenerator'
import type { Biome } from './worldGenerator'

describe('Végétation par biome', () => {
  const world = createWorldGenerator(42)

  function survey() {
    const plantsByBiome = new Map<Biome, { tiles: number; species: Map<string, number> }>()
    for (let y = 1000; y < 9000; y += 13) {
      for (let x = 1000; x < 9000; x += 13) {
        const here = world.sample(x + 0.5, y + 0.5)
        const entry = plantsByBiome.get(here.biome) ?? {tiles: 0, species: new Map()}
        entry.tiles++
        const plant = plantAt(world, x, y, here)
        if (plant) entry.species.set(plant.species, (entry.species.get(plant.species) ?? 0) + 1)
        plantsByBiome.set(here.biome, entry)
      }
    }
    return plantsByBiome
  }
  const plants = survey()
  const density = (biome: Biome) => {
    const entry = plants.get(biome)!
    return [...entry.species.values()].reduce((sum, count) => sum + count, 0) / entry.tiles
  }

  it('place toujours la même plante sur la même case', () => {
    expect(plantAt(createWorldGenerator(42), 5300, 4100)).toEqual(plantAt(world, 5300, 4100))
  })

  it('rend les forêts bien plus denses que les plaines et ne plante rien dans l’eau', () => {
    expect(density('forest')).toBeGreaterThan(density('plains') * 4)
    expect(plants.get('deep_water')!.species.size).toBe(0)
  })

  it('associe à chaque région ses espèces : cactus au désert, saules au marais, rochers en montagne', () => {
    expect(plants.get('desert')!.species.has('cactus')).toBe(true)
    expect(plants.get('desert')!.species.has('oak')).toBe(false)
    expect(plants.get('swamp')!.species.has('willow')).toBe(true)
    expect(plants.get('mountain')!.species.has('rock')).toBe(true)
  })

  it('bloque les arbres et rochers, mais pas les buissons ni les roseaux', () => {
    const plant = {offsetX: 0.5, offsetY: 0.5, scale: 1, rotation: 0, tint: 1}
    expect(blocksMovement({...plant, species: 'oak'})).toBe(true)
    expect(blocksMovement({...plant, species: 'rock'})).toBe(true)
    expect(blocksMovement({...plant, species: 'bush'})).toBe(false)
    expect(blocksMovement({...plant, species: 'reed'})).toBe(false)
    expect(blocksMovement(null)).toBe(false)
  })

  it('ne garde que les arbres dans la version lointaine d’un chunk', () => {
    const forestTile = (() => {
      for (let y = 4000; y < 6000; y += 7) for (let x = 4000; x < 6000; x += 7) if (world.sample(x, y).biome === 'forest') return {x, y}
      throw new Error('aucune forêt')
    })()
    const cx = Math.floor(forestTile.x / 32), cy = Math.floor(forestTile.y / 32)
    const near = buildVegetationData(world, cx, cy, 0), far = buildVegetationData(world, cx, cy, 1)
    expect(far.every(({species}) => FAR_SPECIES.includes(species))).toBe(true)
    const trees = (data: typeof near) => data.filter(({species}) => FAR_SPECIES.includes(species)).reduce((sum, {matrices}) => sum + matrices.length / 16, 0)
    expect(trees(far)).toBe(trees(near))
    expect(buildGrassData(world, cx, cy).matrices.length).toBeGreaterThan(0)
  })

  it('écrit une matrice rotation-échelle-translation au format three.js', () => {
    const matrix = new Float32Array(16)
    writeMatrix(matrix, 0, 10, 2, 30, Math.PI / 2, 2)
    expect(Array.from(matrix).map((value) => Math.round(value * 1000) / 1000))
      .toEqual([0, 0, -2, 0, 0, 2, 0, 0, 2, 0, 0, 0, 10, 2, 30, 1])
  })
})
