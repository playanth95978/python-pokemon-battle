import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { applyDaylight, createCloudCover, daylight, SUNRISE, SUNSET } from './dayCycle'
import type { DayScene } from './dayCycle'

function villageSky(): DayScene {
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0xa9c4d4, 22, 44)
    return {scene, clouds: createCloudCover(), sun: new THREE.DirectionalLight(), sunDirection: new THREE.Vector3(),
        sky: new Sky(), hemisphere: new THREE.HemisphereLight(), lanterns: new THREE.MeshStandardMaterial()}
}

describe('Jour et nuit', () => {
    it('conserve la portée étendue quand l’horloge passe du jour à la nuit', () => {
        const context = villageSky()
        for (const hour of [9, 13, 21, 2]) {
            applyDaylight(context, daylight(hour))
            expect(context.scene.fog).toMatchObject({near: 22, far: 44})
        }
    })

    it('rapproche la brume sous la pluie et restaure la portée au retour du beau temps', () => {
        const context = villageSky()
        applyDaylight(context, daylight(13), 1)
        expect(context.scene.fog).toMatchObject({near: 10, far: 28})
        applyDaylight(context, daylight(13), 0.5)
        expect(context.scene.fog).toMatchObject({near: 16, far: 36})
        applyDaylight(context, daylight(13), 0)
        expect(context.scene.fog).toMatchObject({near: 22, far: 44})
    })

    it('lève le soleil à l’est, le couche à l’ouest et le cache la nuit', () => {
        expect(daylight(13)).toMatchObject({day: 1, elevation: 62, azimuth: 180, lanterns: 0})
        expect(daylight(SUNRISE + 1).azimuth).toBeLessThan(120)
        expect(daylight(SUNSET - 1).azimuth).toBeGreaterThan(240)
        expect(daylight(2)).toMatchObject({day: 0, elevation: -12})
    })

    it('allume les lanternes au crépuscule et les éteint après l’aube', () => {
        expect(daylight(17).lanterns).toBe(0)
        expect(daylight(SUNSET).lanterns).toBe(1)
        expect(daylight(3).lanterns).toBe(1)
        expect(daylight(SUNRISE + 2).lanterns).toBe(0)
    })
})
