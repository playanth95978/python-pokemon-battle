import type { Position, WorldMap } from '../world/types'

/** Chaque traversée a ses propres garde-corps ; deux ponts séparés ne partagent pas une immense rambarde. */
export function bridgeSections(map: WorldMap): Position[][] {
    const pending = new Set<number>()
    map.tiles.forEach((tile, index) => { if (tile === 'bridge') pending.add(index) })
    const sections: Position[][] = []
    for (const start of pending) {
        pending.delete(start)
        const indices = [start], section: Position[] = []
        for (let index = 0; index < indices.length; index++) {
            const cell = indices[index], x = cell % map.width, y = Math.floor(cell / map.width)
            section.push({x, y})
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy, neighbour = ny * map.width + nx
                if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height || !pending.delete(neighbour)) continue
                indices.push(neighbour)
            }
        }
        sections.push(section)
    }
    return sections
}
