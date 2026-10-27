/** Web Worker : génère les maillages de terrain sans bloquer l'affichage. */
import { buildTerrainData } from './terrainGeometry'
import { createWorldGenerator } from './worldGenerator'
import type { WorldGenerator } from './worldGenerator'

export interface TerrainRequest { id: string; seed: number; cx: number; cy: number; lod: number }

let world: WorldGenerator | null = null

self.onmessage = (event: MessageEvent<TerrainRequest>) => {
    const {id, seed, cx, cy, lod} = event.data
    if (!world || world.seed !== seed) world = createWorldGenerator(seed)
    const data = buildTerrainData(world, cx, cy, lod)
    // Les tableaux sont transférés, pas copiés : le worker les perd, le fil principal les reçoit gratuitement.
    self.postMessage({id, lod, ...data}, {transfer: [data.positions.buffer, data.normals.buffer, data.colors.buffer, data.indices.buffer]})
}
