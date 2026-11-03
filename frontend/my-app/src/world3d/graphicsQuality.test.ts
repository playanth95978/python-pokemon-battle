import { describe, expect, it } from 'vitest'
import { pickQuality } from './graphicsQuality'
import { CHUNK_SIZE, LOAD_RADIUS, VIEW_DISTANCE } from './worldChunks'

const RTX = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Laptop GPU (0x00002F18) Direct3D11 vs_5_0 ps_5_0, D3D11)'
const INTEL = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A0) Direct3D11 vs_5_0 ps_5_0, D3D11)'

describe('Qualité graphique', () => {
    it('passe en haute qualité sur une carte NVIDIA dédiée', () => {
        const quality = pickQuality(RTX, '', 1.25)
        expect(quality.level).toBe('high')
        expect(quality.shadowMapSize).toBe(4096)
        expect(quality.maxPixelRatio).toBe(2)
        expect(quality.loadRadius).toBeGreaterThan(LOAD_RADIUS)
    })

    it('garde les réglages historiques sur un GPU intégré ou inconnu', () => {
        for (const gpu of [INTEL, null]) {
            const quality = pickQuality(gpu, '', 1.25)
            expect(quality.level).toBe('standard')
            expect(quality.shadowMapSize).toBe(3072)
            expect(quality.maxPixelRatio).toBe(1.25)
            expect(quality.viewDistance).toBe(VIEW_DISTANCE)
        }
    })

    it('obéit à ?quality= dans l’adresse, quelle que soit la carte', () => {
        expect(pickQuality(RTX, '?quality=standard').level).toBe('standard')
        expect(pickQuality(INTEL, '?quality=high').level).toBe('high')
    })

    it('cache toujours sous la brume la limite du décor chargé', () => {
        for (const gpu of [RTX, INTEL]) {
            const quality = pickQuality(gpu)
            expect(quality.viewDistance).toBeLessThan(quality.loadRadius * CHUNK_SIZE)
            expect(quality.unloadRadius).toBeGreaterThan(quality.loadRadius)
        }
    })
})
