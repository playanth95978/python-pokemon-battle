import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { celShadedChunks } from './celShading'

describe('Ombrage en aplats', () => {
    it('remplace la lumière directe progressive par la rampe en aplats, pour les matériaux standard et Lambert', () => {
        const chunks = celShadedChunks(THREE.ShaderChunk)
        for (const source of [chunks.lights_physical_pars_fragment, chunks.lights_lambert_pars_fragment]) {
            expect(source).toContain('vec3 irradiance = toonRamp( dotNL ) * directLight.color;')
            expect(source).not.toContain('vec3 irradiance = dotNL * directLight.color;')
            // La rampe est déclarée avant d'être utilisée.
            expect(source.indexOf('float toonRamp(')).toBeLessThan(source.indexOf('toonRamp( dotNL )'))
        }
    })

    it('aplatit le relief des cartes de normales', () => {
        const relief = celShadedChunks(THREE.ShaderChunk).normal_fragment_maps
        expect(relief).toContain('mapN.xy *= normalScale * 0.30;')
        expect(relief).not.toContain('mapN.xy *= normalScale;')
    })

    it('ne s’applique qu’une fois, même installé par plusieurs vues', () => {
        const once = celShadedChunks(THREE.ShaderChunk)
        expect(celShadedChunks(once)).toEqual(once)
    })

    it('refuse un éclairage de three.js qu’il ne reconnaît pas plutôt que de l’ignorer', () => {
        const {lights_lambert_pars_fragment, normal_fragment_maps} = THREE.ShaderChunk
        const changed = {lights_physical_pars_fragment: 'void RE_Direct_Physical() {}', lights_lambert_pars_fragment, normal_fragment_maps}
        expect(() => celShadedChunks(changed)).toThrow(/ombrage en aplats impossible/)
    })
})
