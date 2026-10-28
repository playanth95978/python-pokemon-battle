/**
 * Crue à l'écran : une texture d'une texel par case, relue chaque image par l'eau et par le sol.
 * R = hauteur de la surface (voir surfaceHeights), G = eau boueuse (crue sur la terre, rivière en furie),
 * B = boue laissée sur le sol après le passage de l'eau.
 */
import * as THREE from 'three'
import type { Flood } from './flood'
import { surfaceHeights, WET } from './flood'

export function createFloodView(flood: Flood) {
    const size = flood.width * flood.height
    const data = new Uint16Array(size * 4)
    const texture = new THREE.DataTexture(data, flood.width, flood.height, THREE.RGBAFormat, THREE.HalfFloatType)
    texture.magFilter = texture.minFilter = THREE.LinearFilter
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
    const heights = new Float32Array(size)
    const toHalf = THREE.DataUtils.toHalfFloat

    return {
        texture,
        /** Zone couverte par la texture, pour le shader de l'eau : origine x, z et taille. */
        rect: new THREE.Vector4(0, 0, flood.width, flood.height),
        /** `rise` : crue de la rivière, de 0 à 1 (son eau se trouble). */
        update(rise: number) {
            surfaceHeights(flood, heights)
            for (let index = 0; index < size; index++) {
                const land = !flood.river[index]
                data[index * 4] = toHalf(heights[index])
                data[index * 4 + 1] = toHalf(land ? (flood.depth[index] > WET ? 1 : 0.6) : rise * 0.8)
                data[index * 4 + 2] = toHalf(flood.mud[index])
            }
            texture.needsUpdate = true
        },
    }
}
