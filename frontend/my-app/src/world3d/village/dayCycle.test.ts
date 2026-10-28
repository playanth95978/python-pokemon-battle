import { describe, expect, it } from 'vitest'
import { daylight, SUNRISE, SUNSET } from './dayCycle'

describe('Jour et nuit', () => {
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
