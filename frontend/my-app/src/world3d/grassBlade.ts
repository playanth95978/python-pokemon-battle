/** Brin d'herbe commun aux vues 3D : ruban effilé et courbé, sombre à la base, clair à la pointe. */
import * as THREE from 'three'

const SEGMENTS = 4

/**
 * Brin de `height` × `width`, base à l'origine, couché vers +z. La couleur de sommet fait office d'occlusion
 * (0,35 au pied, 1 à la pointe) ; les normales pointent vers le ciel pour qu'une prairie s'éclaire comme un tapis,
 * sans faces noires à contre-jour.
 */
export function createGrassBlade(height = 0.36, width = 0.06) {
    const positions: number[] = [], colors: number[] = [], normals: number[] = [], indices: number[] = []
    for (let segment = 0; segment <= SEGMENTS; segment++) {
        const t = segment / SEGMENTS
        const y = t * height, bend = t * t * height * 0.35, half = width * 0.5 * (1 - t * 0.85)
        const shade = 0.35 + 0.65 * t
        for (const side of [-1, 1]) {
            positions.push(side * half, y, bend)
            colors.push(shade, shade, shade)
            normals.push(0, 1, 0.25)
        }
        if (segment < SEGMENTS) {
            const base = segment * 2
            indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
        }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setIndex(indices)
    geometry.normalizeNormals()
    geometry.computeBoundingSphere()
    return geometry
}
