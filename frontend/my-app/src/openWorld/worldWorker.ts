/** Web Worker : calcule terrain, végétation et herbe hors du fil principal. */
import { buildTerrainData } from './terrainGeometry'
import { buildGrassData, buildVegetationData } from './vegetation'
import { createWorldGenerator } from './worldGenerator'
import type { WorldGenerator } from './worldGenerator'

export type JobKind = 'terrain' | 'vegetation' | 'grass'
export interface JobRequest { id: number; kind: JobKind; seed: number; cx: number; cy: number; level: number }

let world: WorldGenerator | null = null

function compute(world: WorldGenerator, {kind, cx, cy, level}: JobRequest) {
    if (kind === 'terrain') {
        const data = buildTerrainData(world, cx, cy, level)
        return {payload: data, transfer: [data.positions.buffer, data.normals.buffer, data.colors.buffer, data.surfaces.buffer, data.indices.buffer]}
    }
    if (kind === 'vegetation') {
        const data = buildVegetationData(world, cx, cy, level)
        return {payload: data, transfer: data.flatMap(({matrices, colors}) => [matrices.buffer, colors.buffer])}
    }
    const data = buildGrassData(world, cx, cy)
    return {payload: data, transfer: [data.matrices.buffer, data.colors.buffer]}
}

self.onmessage = (event: MessageEvent<JobRequest>) => {
    if (!world || world.seed !== event.data.seed) world = createWorldGenerator(event.data.seed)
    const {payload, transfer} = compute(world, event.data)
    // Les tableaux sont transférés, pas copiés : le worker les perd, le fil principal les reçoit gratuitement.
    self.postMessage({id: event.data.id, payload}, {transfer})
}
