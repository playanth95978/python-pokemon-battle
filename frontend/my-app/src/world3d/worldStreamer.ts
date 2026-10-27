/** Charge les chunks proches du joueur par petites tranches et libère ceux qui sont trop loin. */
import type * as THREE from 'three'
import type { Position, WorldMap } from '../world/types'
import type { ChunkKey } from './worldChunks'
import { chunkId, chunksAround, isOutside } from './worldChunks'

export interface StreamLayer {
    name: string
    loadRadius: number
    unloadRadius: number
    build: (chunk: ChunkKey) => THREE.Object3D | null
    dispose: (object: THREE.Object3D) => void
}

interface LoadedChunk { chunk: ChunkKey; object: THREE.Object3D | null }

export class WorldStreamer {
    private readonly loaded = new Map<string, Map<string, LoadedChunk>>()
    private readonly map: WorldMap
    private readonly scene: THREE.Scene
    private readonly layers: StreamLayer[]

    constructor(map: WorldMap, scene: THREE.Scene, layers: StreamLayer[]) {
        this.map = map
        this.scene = scene
        this.layers = layers
        layers.forEach((layer) => this.loaded.set(layer.name, new Map()))
    }

    /**
     * Libère puis construit des chunks dans la limite de `budgetMs` par image ;
     * au moins un chunk est construit pour que le chargement avance toujours.
     */
    update(player: Position, budgetMs: number) {
        const start = performance.now()
        for (const layer of this.layers) {
            const chunks = this.loaded.get(layer.name)!
            for (const [id, entry] of chunks) {
                if (!isOutside(entry.chunk, player, layer.unloadRadius)) continue
                if (entry.object) layer.dispose(entry.object)
                chunks.delete(id)
            }
        }
        let built = 0
        for (const layer of this.layers) {
            const chunks = this.loaded.get(layer.name)!
            for (const chunk of chunksAround(this.map, player, layer.loadRadius)) {
                const id = chunkId(chunk)
                if (chunks.has(id)) continue
                if (built > 0 && performance.now() - start > budgetMs) return
                const object = layer.build(chunk)
                if (object) this.scene.add(object)
                chunks.set(id, {chunk, object})
                built++
            }
        }
    }

    /** Proportion des chunks attendus autour du joueur déjà construits, toutes couches confondues. */
    progress(player: Position) {
        let expected = 0, ready = 0
        for (const layer of this.layers) {
            const chunks = this.loaded.get(layer.name)!
            for (const chunk of chunksAround(this.map, player, layer.loadRadius)) {
                expected++
                if (chunks.has(chunkId(chunk))) ready++
            }
        }
        return expected ? ready / expected : 1
    }

    loadedCount(layer: string) {
        return this.loaded.get(layer)?.size ?? 0
    }
}
