/**
 * Jour et nuit sur Clairbois : le soleil se lève à 6 h à l'est, culmine vers 13 h et se couche à 20 h à l'ouest ;
 * la nuit, une lune bleutée éclaire faiblement et les lanternes s'allument. Seules des valeurs changent (lumières,
 * ciel, brouillard) : rien n'est recalculé, le coût par image est nul.
 */
import * as THREE from 'three'
import type { Sky } from 'three/addons/objects/Sky.js'

export const SUNRISE = 6, SUNSET = 20

export interface Daylight {
    /** 0 la nuit, 1 en plein midi. */
    day: number
    /** Hauteur et cap du soleil, en degrés (cap 90 : est, 270 : ouest). */
    elevation: number
    azimuth: number
    /** Lanternes : 0 éteintes, 1 pleinement allumées (fondu au crépuscule et à l'aube). */
    lanterns: number
}

export function daylight(hour: number): Daylight {
    const course = (hour - SUNRISE) / (SUNSET - SUNRISE)
    const day = course > 0 && course < 1 ? Math.sin(Math.PI * course) : 0
    const dusk = THREE.MathUtils.smoothstep(hour, SUNSET - 1.5, SUNSET - 0.5)
    const dawn = 1 - THREE.MathUtils.smoothstep(hour, SUNRISE, SUNRISE + 1)
    return {
        day,
        elevation: course > 0 && course < 1 ? 4 + day * 58 : -12,
        azimuth: 90 + THREE.MathUtils.clamp(course, 0, 1) * 180,
        lanterns: Math.max(dusk, dawn),
    }
}

const NOON = new THREE.Color(0xffe2b8), DAWN = new THREE.Color(0xff9a5a), MOON = new THREE.Color(0x8fa6ff)
const DAY_FOG = new THREE.Color(0xa9c4d4), NIGHT_FOG = new THREE.Color(0x141c2b)
/** La lune, fixe et haute au sud : les ombres restent lisibles la nuit. */
const MOON_DIRECTION = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(40), THREE.MathUtils.degToRad(200))

export interface DayScene {
    scene: THREE.Scene
    sun: THREE.DirectionalLight
    sunDirection: THREE.Vector3
    sky: Sky
    hemisphere: THREE.HemisphereLight
    lanterns: THREE.MeshStandardMaterial
}

export function applyDaylight({scene, sun, sunDirection, sky, hemisphere, lanterns}: DayScene, light: Daylight) {
    const sunPosition = new THREE.Vector3().setFromSphericalCoords(1,
        THREE.MathUtils.degToRad(90 - light.elevation), THREE.MathUtils.degToRad(light.azimuth))
    sky.material.uniforms.sunPosition.value.copy(sunPosition)
    // Le soleil sous l'horizon n'éclaire plus : la lumière directionnelle devient la lune.
    const night = 1 - THREE.MathUtils.smoothstep(light.day, 0, 0.12)
    sunDirection.copy(sunPosition).lerp(MOON_DIRECTION, night).normalize()
    sun.color.copy(DAWN).lerp(NOON, THREE.MathUtils.smoothstep(light.day, 0.1, 0.6)).lerp(MOON, night)
    sun.intensity = THREE.MathUtils.lerp(0.35, 3.4, Math.pow(light.day, 0.5))
    hemisphere.intensity = 0.12 + 0.48 * light.day
    scene.environmentIntensity = 0.05 + 0.3 * light.day
    if (scene.fog) scene.fog.color.copy(NIGHT_FOG).lerp(DAY_FOG, Math.pow(light.day, 0.5))
    lanterns.emissiveIntensity = light.lanterns * 2.4
}
