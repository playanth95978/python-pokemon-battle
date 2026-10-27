/** Pool de workers partagé par toutes les couches ; la couche mise à jour en premier est servie en premier. */
import type { JobKind, JobRequest } from './worldWorker'

export class WorkerPool {
    private readonly workers: Worker[]
    private readonly callbacks = new Map<number, (payload: unknown) => void>()
    private readonly seed: number
    private nextId = 0

    constructor(seed: number) {
        this.seed = seed
        const count = Math.min(4, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1))
        this.workers = Array.from({length: count}, () => {
            const worker = new Worker(new URL('./worldWorker.ts', import.meta.url), {type: 'module'})
            worker.onmessage = (event: MessageEvent<{ id: number; payload: unknown }>) => {
                const callback = this.callbacks.get(event.data.id)
                this.callbacks.delete(event.data.id)
                callback?.(event.data.payload)
            }
            return worker
        })
    }

    /** Deux tâches par worker : l'un calcule pendant que l'autre résultat traverse vers le fil principal. */
    get hasCapacity() {
        return this.callbacks.size < this.workers.length * 2
    }

    get busy() {
        return this.callbacks.size
    }

    get size() {
        return this.workers.length
    }

    run(kind: JobKind, cx: number, cy: number, level: number, callback: (payload: unknown) => void) {
        const request: JobRequest = {id: this.nextId++, kind, seed: this.seed, cx, cy, level}
        this.callbacks.set(request.id, callback)
        this.workers[request.id % this.workers.length].postMessage(request)
    }
}
