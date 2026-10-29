/** Charge les chunks proches du joueur par petites tranches et libère ceux qui sont trop loin. */
import type * as THREE from 'three'
import type { Position, WorldMap } from '../world/types'
import type { ChunkKey } from './worldChunks'
import { chunkId, chunkOf, chunksAround, isOutside } from './worldChunks'

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
    private center: string | null = null
    private readonly expected = new Map<string, ChunkKey[]>()
    private readonly pending = new Map<string, ChunkKey[]>()

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
        const center = chunkId(chunkOf(player))
        // La carte et les rayons sont fixes : pas de tri ni de recherche répétée à chaque image.
        if (center !== this.center) {
            this.center = center
            for (const layer of this.layers) {
                const chunks = this.loaded.get(layer.name)!
                for (const [id, entry] of chunks) {
                    if (!isOutside(entry.chunk, player, layer.unloadRadius)) continue
                    if (entry.object) layer.dispose(entry.object)
                    chunks.delete(id)
                }
                const expected = chunksAround(this.map, player, layer.loadRadius)
                this.expected.set(layer.name, expected)
                this.pending.set(layer.name, expected.filter((chunk) => !chunks.has(chunkId(chunk))))
            }
        }
        let built = 0
        for (const layer of this.layers) {
            const chunks = this.loaded.get(layer.name)!
            const pending = this.pending.get(layer.name)!
            while (pending.length) {
                if (built > 0 && performance.now() - start > budgetMs) return
                const chunk = pending.shift()!
                const id = chunkId(chunk)
                const object = layer.build(chunk)
                if (object) this.scene.add(object)
                chunks.set(id, {chunk, object})
                built++
            }
        }
    }

    /** Reconstruit au plus vite le chunk de cette case, s'il est chargé (la carte a changé, par exemple un meuble déplacé). */
    refresh(tile: Position) {
        const chunk = chunkOf(tile), id = chunkId(chunk)
        for (const layer of this.layers) {
            const entry = this.loaded.get(layer.name)!.get(id)
            if (!entry) continue
            if (entry.object) layer.dispose(entry.object)
            this.loaded.get(layer.name)!.delete(id)
            this.pending.get(layer.name)?.unshift(chunk)
        }
    }

    /** Proportion des chunks attendus autour du joueur déjà construits, toutes couches confondues. */
    progress(player: Position) {
        let expected = 0, ready = 0
        for (const layer of this.layers) {
            const chunks = this.loaded.get(layer.name)!
            const nearby = chunkId(chunkOf(player)) === this.center
                ? this.expected.get(layer.name)! : chunksAround(this.map, player, layer.loadRadius)
            for (const chunk of nearby) {
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
