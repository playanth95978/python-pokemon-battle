/**
 * Dehors, la caméra ne rentre pas dans les maisons ni dans le château : elle avance vers le dresseur jusqu'à
 * passer devant l'obstacle, comme dans le château (voir cameraDistance dans castleMode.ts).
 * Module pur : une hauteur d'obstacle par case, sans three.js.
 */
import type { Position, WorldMap } from '../world/types'
import { CASTLE_AREA } from './castle/castleArea'

/** Hauteur des maisons, toit compris (modèles à l'échelle des habitants), et des remparts du château. */
const HOUSE_HEIGHT = 8.2, CASTLE_HEIGHT = 6
/** Pas d'échantillonnage le long du recul, en part de celui-ci. */
const STEP = 0.04
/** Marge gardée devant l'obstacle, en unités du monde. */
const MARGIN = 0.35

interface Point { x: number; y: number; z: number }

export function createCameraObstacles(map: WorldMap) {
    const heights = new Float32Array(map.width * map.height)
    const raise = ({x, y}: Position, height: number) => {
        if (x >= 0 && y >= 0 && x < map.width && y < map.height) heights[y * map.width + x] = Math.max(heights[y * map.width + x], height)
    }
    for (const building of map.buildings) {
        for (let y = building.y; y < building.y + building.height; y++) for (let x = building.x; x < building.x + building.width; x++) raise({x, y}, HOUSE_HEIGHT)
    }
    for (let y = CASTLE_AREA.y; y < CASTLE_AREA.y + CASTLE_AREA.depth; y++) {
        for (let x = CASTLE_AREA.x; x < CASTLE_AREA.x + CASTLE_AREA.width; x++) raise({x, y}, CASTLE_HEIGHT)
    }
    const heightAt = (x: number, z: number) => {
        const tx = Math.floor(x), tz = Math.floor(z)
        return tx < 0 || tz < 0 || tx >= map.width || tz >= map.height ? 0 : heights[tz * map.width + tx]
    }

    /**
     * Part du recul `offset` (depuis `target`) que la caméra peut prendre sans entrer dans un bâtiment. Le regard va
     * du dresseur à la caméra : un obstacle plus bas que cette ligne (muret, maison basse sous une vue plongeante)
     * ne gêne pas.
     */
    return (target: Point, offset: Point) => {
        let allowed = 1
        for (let t = STEP; t <= 1.0001; t += STEP) {
            const x = target.x + offset.x * t, z = target.z + offset.z * t
            if (target.y + offset.y * t < heightAt(x, z)) {
                allowed = t - STEP
                break
            }
        }
        if (allowed >= 1) return 1
        const margin = MARGIN / Math.max(0.5, Math.hypot(offset.x, offset.z))
        // Dos au mur, la caméra peut finir à l'aplomb du dresseur : elle le regarde alors d'en haut.
        return Math.max(0, allowed - margin)
    }
}
