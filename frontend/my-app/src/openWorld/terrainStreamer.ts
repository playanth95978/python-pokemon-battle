/** Charge le terrain autour du joueur via un pool de workers, avec un niveau de détail par distance. */
import * as THREE from 'three'
import type { TerrainData } from './terrainGeometry'
import { lodFor, TERRAIN_CHUNK } from './terrainGeometry'
import type { TerrainRequest } from './terrainWorker'
import { WORLD_SIZE } from './worldGenerator'

/** Rayon d'affichage en chunks (10 × 32 = 320 cases), masqué au-delà par le brouillard. */
export const VIEW_RADIUS = 10
/** Un chunk n'est libéré qu'un cran plus loin, pour ne pas le reconstruire en va-et-vient. */
const DROP_RADIUS = VIEW_RADIUS + 1
const CHUNKS_PER_SIDE = Math.ceil(WORLD_SIZE / TERRAIN_CHUNK)

interface Entry {
    cx: number
    cy: number
    /** Détail du maillage affiché (-1 tant qu'aucun n'est arrivé). */
    lod: number
    mesh: THREE.Mesh | null
    /** Détail demandé aux workers, ou null si rien n'est attendu. */
    wanted: number | null
    inFlight: boolean
}

type TerrainResult = TerrainData & { id: string; lod: number }

export class TerrainStreamer {
    private readonly entries = new Map<string, Entry>()
    private readonly workers: Worker[]
    private readonly queue: Entry[] = []
    private readonly scene: THREE.Scene
    private readonly material: THREE.Material
    private readonly seed: number
    private inFlight = 0
    private nextWorker = 0
    private center = ''

    constructor(scene: THREE.Scene, material: THREE.Material, seed: number) {
        this.scene = scene
        this.material = material
        this.seed = seed
        const count = Math.min(4, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1))
        this.workers = Array.from({length: count}, () => {
            const worker = new Worker(new URL('./terrainWorker.ts', import.meta.url), {type: 'module'})
            worker.onmessage = (event: MessageEvent<TerrainResult>) => this.receive(event.data)
            return worker
        })
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
        for (const [id, entry] of this.entries) {
            if (Math.max(Math.abs(entry.cx - cx), Math.abs(entry.cy - cy)) <= DROP_RADIUS) continue
            entry.mesh?.geometry.dispose()
            entry.mesh?.removeFromParent()
            this.entries.delete(id)
        }
        this.queue.length = 0
        for (const entry of this.entries.values()) if (!entry.inFlight) entry.wanted = null
        const wanted: { entry: Entry; distance: number }[] = []
        for (let y = Math.max(0, cy - VIEW_RADIUS); y <= Math.min(CHUNKS_PER_SIDE - 1, cy + VIEW_RADIUS); y++) {
            for (let x = Math.max(0, cx - VIEW_RADIUS); x <= Math.min(CHUNKS_PER_SIDE - 1, cx + VIEW_RADIUS); x++) {
                const distance = Math.max(Math.abs(x - cx), Math.abs(y - cy))
                const lod = lodFor(distance)
                const id = `${x},${y}`
                let entry = this.entries.get(id)
                if (!entry) {
                    entry = {cx: x, cy: y, lod: -1, mesh: null, wanted: null, inFlight: false}
                    this.entries.set(id, entry)
                }
                if (entry.lod === lod) {
                    // Le bon maillage est déjà affiché : un calcul en cours pour un autre détail sera ignoré.
                    entry.wanted = null
                    continue
                }
                if (entry.wanted === lod) continue
                entry.wanted = lod
                if (!entry.inFlight) wanted.push({entry, distance: Math.hypot(x - cx, y - cy)})
            }
        }
        wanted.sort((a, b) => a.distance - b.distance).forEach(({entry}) => this.queue.push(entry))
    }

    private dispatch() {
        // Deux requêtes par worker : l'un calcule pendant que l'autre résultat traverse vers le fil principal.
        while (this.inFlight < this.workers.length * 2 && this.queue.length) {
            const entry = this.queue.shift()!
            if (entry.wanted === null || entry.inFlight) continue
            entry.inFlight = true
            this.inFlight++
            const request: TerrainRequest = {id: `${entry.cx},${entry.cy}`, seed: this.seed, cx: entry.cx, cy: entry.cy, lod: entry.wanted}
            this.workers[this.nextWorker++ % this.workers.length].postMessage(request)
        }
    }

    private receive(result: TerrainResult) {
        this.inFlight--
        const entry = this.entries.get(result.id)
        if (!entry) return this.dispatch()
        entry.inFlight = false
        if (entry.wanted === null) return this.dispatch()
        if (entry.wanted !== result.lod) {
            // Le joueur a bougé pendant le calcul : redemander le bon détail en priorité.
            this.queue.unshift(entry)
            return this.dispatch()
        }
        entry.wanted = null
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(result.positions, 3))
        geometry.setAttribute('normal', new THREE.BufferAttribute(result.normals, 3))
        geometry.setAttribute('color', new THREE.BufferAttribute(result.colors, 3))
        geometry.setIndex(new THREE.BufferAttribute(result.indices, 1))
        geometry.computeBoundingSphere()
        // L'ancien maillage reste affiché jusqu'à l'arrivée du nouveau : jamais de trou.
        entry.mesh?.geometry.dispose()
        entry.mesh?.removeFromParent()
        const mesh = new THREE.Mesh(geometry, this.material)
        mesh.receiveShadow = true
        mesh.castShadow = result.lod <= 1
        mesh.matrixAutoUpdate = false
        this.scene.add(mesh)
        entry.mesh = mesh
        entry.lod = result.lod
        this.dispatch()
    }

    stats() {
        let loaded = 0
        for (const entry of this.entries.values()) if (entry.mesh) loaded++
        return {loaded, pending: this.queue.length + this.inFlight, workers: this.workers.length}
    }

    dispose() {
        this.workers.forEach((worker) => worker.terminate())
        for (const entry of this.entries.values()) entry.mesh?.geometry.dispose()
    }
}
