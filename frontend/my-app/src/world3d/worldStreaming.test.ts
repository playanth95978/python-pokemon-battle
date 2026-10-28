import { describe, expect, it } from 'vitest'
import { Group, Scene } from 'three'
import { WORLD_MAP } from '../world/worldMap'
import { WorldStreamer } from './worldStreamer'
import { LOAD_RADIUS, UNLOAD_RADIUS } from './worldChunks'

describe('Chargement de Clairbois agrandi', () => {
  it('borne le décor résident pendant une traversée des cinq quartiers', () => {
    const scene = new Scene()
    let disposed = 0
    const streamer = new WorldStreamer(WORLD_MAP, scene, [{
      name: 'decor', loadRadius: LOAD_RADIUS, unloadRadius: UNLOAD_RADIUS,
      build: () => new Group(),
      dispose: (object) => { object.removeFromParent(); disposed++ },
    }])
    for (const [x, y] of [[18, 36], [80, 34], [128, 34], [18, 88], [84, 90], [157, 34]]) {
      streamer.update({x, y}, Infinity)
      expect(streamer.progress({x, y})).toBe(1)
      // L'hystérésis autorise au plus quinze chunks par axe, quelle que soit la taille de la carte.
      expect(streamer.loadedCount('decor')).toBeLessThanOrEqual(225)
      expect(scene.children.length).toBe(streamer.loadedCount('decor'))
    }
    expect(disposed).toBeGreaterThan(0)
  })

  it('réutilise les chunks déjà chargés quand le joueur reste dans le quartier', () => {
    let builds = 0
    const streamer = new WorldStreamer(WORLD_MAP, new Scene(), [{
      name: 'decor', loadRadius: 1, unloadRadius: 2,
      build: () => { builds++; return null }, dispose: () => {},
    }])
    streamer.update({x: 80, y: 88}, Infinity)
    expect(builds).toBe(9)
    streamer.update({x: 81, y: 89}, Infinity)
    expect(builds).toBe(9)
  })
})
