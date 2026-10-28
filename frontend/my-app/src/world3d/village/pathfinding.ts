/** Recherche de chemin A* sur les cases de la carte, en quatre directions (comme le dresseur). */
import type { Position } from '../../world/types'

const STEPS: Position[] = [{x: 0, y: -1}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}]
/** Au-delà, la destination est jugée inaccessible : un passant bloqué ne doit pas coûter une image entière. */
const MAX_VISITED = 2500

const key = ({x, y}: Position) => x * 4096 + y

/**
 * Cases à parcourir de `from` (exclue) à `to` (incluse), ou null si `to` est hors d'atteinte.
 * `passable` dit si une case est praticable ; le départ l'est toujours.
 */
export function findPath(from: Position, to: Position, passable: (tile: Position) => boolean): Position[] | null {
    if (from.x === to.x && from.y === to.y) return []
    if (!passable(to)) return null
    const cameFrom = new Map<number, Position>(), cost = new Map([[key(from), 0]])
    // File de priorité minimale (tas binaire) sur le coût estimé.
    const heap: [number, Position][] = [[distance(from, to), from]]
    const push = (entry: [number, Position]) => {
        heap.push(entry)
        for (let index = heap.length - 1; index > 0;) {
            const parent = (index - 1) >> 1
            if (heap[parent][0] <= heap[index][0]) break
            ;[heap[parent], heap[index]] = [heap[index], heap[parent]]
            index = parent
        }
    }
    const pop = () => {
        const top = heap[0], last = heap.pop()!
        if (heap.length) {
            heap[0] = last
            for (let index = 0; ;) {
                const left = index * 2 + 1, right = left + 1
                let smallest = index
                if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left
                if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right
                if (smallest === index) break
                ;[heap[smallest], heap[index]] = [heap[index], heap[smallest]]
                index = smallest
            }
        }
        return top[1]
    }
    let visited = 0
    while (heap.length && visited++ < MAX_VISITED) {
        const current = pop()
        if (current.x === to.x && current.y === to.y) {
            const path = [current]
            for (let step = cameFrom.get(key(current)); step && key(step) !== key(from); step = cameFrom.get(key(step))) path.push(step)
            return path.reverse()
        }
        const reached = cost.get(key(current))!
        for (const step of STEPS) {
            const next = {x: current.x + step.x, y: current.y + step.y}
            if (!passable(next)) continue
            const nextCost = reached + 1
            if (nextCost >= (cost.get(key(next)) ?? Infinity)) continue
            cost.set(key(next), nextCost)
            cameFrom.set(key(next), current)
            push([nextCost + distance(next, to), next])
        }
    }
    return null
}

export function distance(a: Position, b: Position) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}
