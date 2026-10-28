import { describe, expect, it, vi } from 'vitest'
import { MeshStandardMaterial } from 'three'
import type { WorldMaterials } from './worldMaterials'
import { WORLD_MAP } from '../world/worldMap'
import { buildGroundChunk, disposeChunk } from './buildWorld3D'

describe('Sol de Clairbois chargé par zone', () => {
  it('garde la même finesse et le même nombre de sommets dans les quartiers éloignés', () => {
    const material = new MeshStandardMaterial()
    for (const chunk of [{cx: 2, cy: 4}, {cx: 10, cy: 11}, {cx: 19, cy: 15}]) {
      const ground = buildGroundChunk(WORLD_MAP, chunk, {ground: material} as WorldMaterials, {height: () => 0, tile: () => 0})
      expect(ground.geometry.attributes.position.count).toBe(289)
      expect(ground.geometry.index?.count).toBe(1536)
      expect(ground.material).toBe(material)
      ground.geometry.computeBoundingBox()
      expect(ground.geometry.boundingBox!.min.x).toBe(chunk.cx * 8)
      expect(ground.geometry.boundingBox!.max.z).toBe(chunk.cy * 8 + 8)
      const disposed = vi.spyOn(ground.geometry, 'dispose')
      disposeChunk(ground)
      expect(disposed).toHaveBeenCalledOnce()
    }
  })
})
