/** Emprise du château, sans rendu : les tests et la vie du village s'en servent sans charger three.js. */
import type { Position } from '../../world/types'

/** Emprise du château en cases de Clairbois ; la porte occupe les cases (23, 50) et (23, 51) du rempart ouest. */
export const CASTLE_AREA = {x: 23, y: 45, width: 12, depth: 12}

export function castleBlocks({x, y}: Position) {
    return x >= CASTLE_AREA.x && x < CASTLE_AREA.x + CASTLE_AREA.width && y >= CASTLE_AREA.y && y < CASTLE_AREA.y + CASTLE_AREA.depth
}
