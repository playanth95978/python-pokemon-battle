import type { Direction, Position } from '../world/types'

/** Rotation du terrain : le haut du radar suit le regard de la caméra. */
export function minimapOffset(point: Position, player: Position, cameraYaw: number, pixelsPerUnit: number): Position {
    const dx = (point.x - player.x) * pixelsPerUnit, dy = (point.y - player.y) * pixelsPerUnit
    const cos = Math.cos(cameraYaw), sin = Math.sin(cameraYaw)
    return {x: cos * dx - sin * dy, y: sin * dx + cos * dy}
}

export function playerHeading(direction: Direction, cameraYaw: number): number {
    const headings: Record<Direction, number> = {up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2}
    return headings[direction] + cameraYaw
}
