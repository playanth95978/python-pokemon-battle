/** Sortie est de Clairbois 3D : au bout de la grande route, le chemin mène au monde ouvert. */
import type { Direction, Position } from '../world/types'

export const OPEN_WORLD_URL = '/open-world.html'
/** Dernières cases de la route est-ouest, juste avant la bordure d'arbres. */
export const EXIT = {x: 61, minY: 33, maxY: 35, direction: 'right' as Direction}

/** Vrai si le dresseur pousse vers l'est depuis le bout de la route. */
export function leadsToOpenWorld(position: Position, direction: Direction) {
    return direction === EXIT.direction && position.x === EXIT.x && position.y >= EXIT.minY && position.y <= EXIT.maxY
}

/** Le dresseur arrive à l'approche de la sortie (indice affiché dans le HUD). */
export function nearExit(position: Position) {
    return position.x >= EXIT.x - 4 && position.y >= EXIT.minY && position.y <= EXIT.maxY
}

/** Arbres de bordure retirés en 3D pour laisser voir la trouée vers l'extérieur. */
export function isExitGap(position: Position) {
    return position.x > EXIT.x && position.y >= EXIT.minY - 1 && position.y <= EXIT.maxY + 1
}
