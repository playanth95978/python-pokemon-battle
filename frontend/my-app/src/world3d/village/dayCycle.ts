/**
 * Jour et nuit sur Clairbois : le soleil se lève à 6 h à l'est, culmine vers 13 h et se couche à 20 h à l'ouest ;
 * la nuit, une lune bleutée éclaire faiblement et les lanternes s'allument. Seules des valeurs changent (lumières,
 * ciel, brouillard) : rien n'est recalculé, le coût par image est nul.
 */
import * as THREE from 'three'
import { VIEW_DISTANCE } from '../worldChunks'
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
const DAY_FOG = new THREE.Color(0xa9c4d4), NIGHT_FOG = new THREE.Color(0x141c2b), RAIN_FOG = new THREE.Color(0x7d878f)
/** Brouillard par beau temps et sous l'averse la plus forte. */
const FOG_DENSITY = 0.034, RAIN_DENSITY = 0.05
const dayFog = new THREE.Color()
/** La lune, fixe et haute au sud : les ombres restent lisibles la nuit. */
const MOON_DIRECTION = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(40), THREE.MathUtils.degToRad(200))

/**
 * Couche nuageuse : une sphère autour de la caméra, de la couleur de la brume, qui voile le ciel sous la pluie
 * (le shader du ciel ne sait pas devenir gris). À placer sur la caméra à chaque image.
 */
export function createCloudCover() {
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 12),
        new THREE.MeshBasicMaterial({side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false}))
    clouds.name = 'nuages'
    clouds.visible = false
    return clouds
}

export interface DayScene {
    scene: THREE.Scene
    clouds: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
    sun: THREE.DirectionalLight
    sunDirection: THREE.Vector3
    sky: Sky
    hemisphere: THREE.HemisphereLight
    lanterns: THREE.MeshStandardMaterial
}

/** `overcast` : ciel couvert par la pluie, de 0 à 1 (soleil voilé, brume grise, lanternes allumées plus tôt). */
export function applyDaylight({scene, clouds, sun, sunDirection, sky, hemisphere, lanterns}: DayScene, light: Daylight, overcast = 0) {
    // Ciel bleu profond de dessin animé par beau temps (voir createAtmosphere), gris laiteux sous la pluie.
    sky.material.uniforms.turbidity.value = 2 + overcast * 18
    sky.material.uniforms.rayleigh.value = 2.6 - overcast * 2.3
    const sunPosition = new THREE.Vector3().setFromSphericalCoords(1,
        THREE.MathUtils.degToRad(90 - light.elevation), THREE.MathUtils.degToRad(light.azimuth))
    sky.material.uniforms.sunPosition.value.copy(sunPosition)
    // Le soleil sous l'horizon n'éclaire plus : la lumière directionnelle devient la lune.
    const night = 1 - THREE.MathUtils.smoothstep(light.day, 0, 0.12)
    sunDirection.copy(sunPosition).lerp(MOON_DIRECTION, night).normalize()
    sun.color.copy(DAWN).lerp(NOON, THREE.MathUtils.smoothstep(light.day, 0.1, 0.6)).lerp(MOON, night)
    sun.intensity = THREE.MathUtils.lerp(0.35, 3.4, Math.pow(light.day, 0.5)) * (1 - overcast * 0.75)
    // Ambiance forte : les ombres en aplats restent claires et colorées, comme dans un dessin animé, pas noires.
    hemisphere.intensity = (0.15 + 1.05 * light.day) * (1 - overcast * 0.15)
    scene.environmentIntensity = (0.05 + 0.3 * light.day) * (1 - overcast * 0.4)
    if (scene.fog) scene.fog.color.copy(NIGHT_FOG).lerp(dayFog.copy(DAY_FOG).lerp(RAIN_FOG, overcast), Math.pow(light.day, 0.5))
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = FOG_DENSITY + (RAIN_DENSITY - FOG_DENSITY) * overcast
    if (scene.fog instanceof THREE.Fog) {
        // L'horloge ne rétablit pas l'ancienne brume dense ; seule la pluie rapproche sa limite.
        scene.fog.near = THREE.MathUtils.lerp(VIEW_DISTANCE / 2, 10, overcast)
        scene.fog.far = THREE.MathUtils.lerp(VIEW_DISTANCE, 28, overcast)
    }
    lanterns.emissiveIntensity = Math.max(light.lanterns, overcast * 0.6) * 2.4
    clouds.visible = overcast > 0.01
    if (scene.fog) clouds.material.color.copy(scene.fog.color)
    clouds.material.opacity = Math.min(1, overcast * 1.1)
}
