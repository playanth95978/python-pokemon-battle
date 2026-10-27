/** Streaming générique de chunks : chaque couche (terrain, végétation, herbe) choisit son détail selon la distance. */
import type * as THREE from 'three'
import { TERRAIN_CHUNK } from './terrainGeometry'
import type { WorkerPool } from './workerPool'
import type { JobKind } from './worldWorker'
import { WORLD_SIZE } from './worldGenerator'

const CHUNKS_PER_SIDE = Math.ceil(WORLD_SIZE / TERRAIN_CHUNK)

export interface StreamLayer<Payload> {
    kind: JobKind
    /** Distance maximale (en chunks) où la couche existe. */
    radius: number
    /** Détail voulu à cette distance (0 = le plus fin). */
    levelFor: (distance: number) => number
    build: (payload: Payload, level: number) => THREE.Object3D | null
    dispose: (object: THREE.Object3D) => void
}

interface Entry {
    cx: number
    cy: number
    /** Détail affiché (-1 tant que rien n'est arrivé). */
    level: number
    object: THREE.Object3D | null
    /** Détail demandé, ou null si rien n'est attendu. */
    wanted: number | null
    inFlight: boolean
}

export class ChunkStreamer<Payload> {
    private readonly entries = new Map<string, Entry>()
    private readonly queue: Entry[] = []
    private readonly scene: THREE.Scene
    private readonly pool: WorkerPool
    private readonly layer: StreamLayer<Payload>
    private center = ''

    constructor(scene: THREE.Scene, pool: WorkerPool, layer: StreamLayer<Payload>) {
        this.scene = scene
        this.pool = pool
        this.layer = layer
    }

    update(player: { x: number; y: number }) {
        const cx = Math.floor(player.x / TERRAIN_CHUNK), cy = Math.floor(player.y / TERRAIN_CHUNK)
        const center = `${cx},${cy}`
        if (center !== this.center) {
            this.center = center
            this.plan(cx, cy)
        }
        this.dispatch()
    }

    /** Recalcule les chunks voulus et leur détail ; la file repart du plus proche au plus lointain. */
    private plan(cx: number, cy: number) {
        const {radius, levelFor} = this.layer
        for (const [id, entry] of this.entries) {
            // Libéré un cran plus loin que le rayon : pas de reconstruction en va-et-vient.
            if (Math.max(Math.abs(entry.cx - cx), Math.abs(entry.cy - cy)) <= radius + 1) continue
            this.release(entry)
            this.entries.delete(id)
        }
        this.queue.length = 0
        for (const entry of this.entries.values()) if (!entry.inFlight) entry.wanted = null
        const wanted: { entry: Entry; distance: number }[] = []
        for (let y = Math.max(0, cy - radius); y <= Math.min(CHUNKS_PER_SIDE - 1, cy + radius); y++) {
            for (let x = Math.max(0, cx - radius); x <= Math.min(CHUNKS_PER_SIDE - 1, cx + radius); x++) {
                const level = levelFor(Math.max(Math.abs(x - cx), Math.abs(y - cy)))
                const id = `${x},${y}`
                let entry = this.entries.get(id)
                if (!entry) {
                    entry = {cx: x, cy: y, level: -1, object: null, wanted: null, inFlight: false}
                    this.entries.set(id, entry)
                }
                if (entry.level === level) {
                    // Le bon détail est déjà affiché : un calcul en cours pour un autre détail sera ignoré.
                    entry.wanted = null
                    continue
                }
                if (entry.wanted === level) continue
                entry.wanted = level
                if (!entry.inFlight) wanted.push({entry, distance: Math.hypot(x - cx, y - cy)})
            }
        }
        wanted.sort((a, b) => a.distance - b.distance).forEach(({entry}) => this.queue.push(entry))
    }

    private dispatch() {
        while (this.pool.hasCapacity && this.queue.length) {
            const entry = this.queue.shift()!
            if (entry.wanted === null || entry.inFlight) continue
            const level = entry.wanted
            entry.inFlight = true
            this.pool.run(this.layer.kind, entry.cx, entry.cy, level, (payload) => this.receive(entry, level, payload as Payload))
        }
    }

    private receive(entry: Entry, level: number, payload: Payload) {
        entry.inFlight = false
        if (this.entries.get(`${entry.cx},${entry.cy}`) !== entry || entry.wanted === null) return
        if (entry.wanted !== level) {
            // Le joueur a bougé pendant le calcul : redemander le bon détail en priorité.
            this.queue.unshift(entry)
            return
        }
        entry.wanted = null
        // L'ancien objet reste affiché jusqu'à l'arrivée du nouveau : jamais de trou.
        this.release(entry)
        entry.object = this.layer.build(payload, level)
        if (entry.object) {
            entry.object.matrixAutoUpdate = false
            this.scene.add(entry.object)
        }
        entry.level = level
    }

    private release(entry: Entry) {
        if (!entry.object) return
        this.layer.dispose(entry.object)
        entry.object.removeFromParent()
        entry.object = null
    }

    stats() {
        let loaded = 0, pending = this.queue.length
        for (const entry of this.entries.values()) {
            if (entry.level >= 0) loaded++
            if (entry.inFlight) pending++
        }
        return {loaded, pending}
    }
}
