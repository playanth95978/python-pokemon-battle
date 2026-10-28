/**
 * Météo de Clairbois, en heures de jeu : des averses de temps en temps, parfois un orage. La pluie gorge le sol
 * (la nappe remonte et remplit les cuvettes) ; l'orage gonfle la rivière, qui déborde dans la vallée. Après, tout
 * redescend lentement : la rivière en quelques heures, la nappe en une demi-journée.
 */
import { RIVER_LEVEL } from '../terrain'
import type { FloodLevels } from './flood'

/** Chance, par heure de beau temps, qu'une averse commence (environ une par journée). */
const RAIN_CHANCE = 0.05
/** Part des averses qui tournent à l'orage. */
const STORM_CHANCE = 0.35
/** La pluie s'installe et se retire en une demi-heure. */
const RAMP = 2
/** Gorgement du sol et crue de la rivière : montée par heure de pluie (ou d'orage), descente par heure sèche. */
const SOAK_RATE = 0.4, SOAK_DRAIN = 0.08
const RISE_RATE = 0.45, RISE_DRAIN = 0.15
/** Rivière au plus haut : quelques centimètres sous le plateau du bourg. */
const PEAK_LEVEL = -0.06
/** Nappe par temps sec (sous les berges) et sol gorgé d'eau (sous le plateau, au-dessus des cuvettes). */
const DRY_TABLE = -0.6, WET_TABLE = -0.08

export interface Weather {
    /** Pluie actuelle, de 0 à 1. */
    rain: number
    /** Heures de pluie restantes (0 : beau temps). */
    left: number
    storm: boolean
    /** Sol gorgé d'eau, de 0 à 1. */
    soak: number
    /** Crue de la rivière, de 0 à 1. */
    rise: number
}

export function createWeather(): Weather {
    return {rain: 0, left: 0, storm: false, soak: 0, rise: 0}
}

/** Déclenche une pluie (`storm` : un orage) qui dure `hours` heures. */
export function startRain(weather: Weather, hours: number, storm: boolean) {
    weather.left = hours
    weather.storm = storm
}

export function updateWeather(weather: Weather, hours: number, random: () => number) {
    if (weather.left <= 0 && random() < RAIN_CHANCE * hours) startRain(weather, 2 + random() * 3, random() < STORM_CHANCE)
    const raining = weather.left > 0
    weather.left = Math.max(0, weather.left - hours)
    if (!raining) weather.storm = weather.rain > 0.05 && weather.storm
    const target = raining ? (weather.storm ? 1 : 0.6) : 0
    weather.rain += Math.sign(target - weather.rain) * Math.min(Math.abs(target - weather.rain), RAMP * hours)
    weather.soak = clamp(weather.soak + (weather.rain > 0.1 ? SOAK_RATE * weather.rain : -SOAK_DRAIN) * hours)
    weather.rise = clamp(weather.rise + (weather.storm && weather.rain > 0.5 ? RISE_RATE : -RISE_DRAIN) * hours)
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

export function floodLevels(weather: Weather): FloodLevels {
    return {
        river: RIVER_LEVEL + (PEAK_LEVEL - RIVER_LEVEL) * weather.rise,
        table: DRY_TABLE + (WET_TABLE - DRY_TABLE) * weather.soak,
    }
}

/** Ce que le HUD affiche du temps qu'il fait. */
export function describeWeather(weather: Weather) {
    if (weather.rise > 0.5) return weather.rain > 0.3 ? 'orage · la rivière déborde' : 'crue'
    if (weather.storm && weather.rain > 0.3) return 'orage'
    if (weather.rain > 0.1) return 'pluie'
    if (weather.rise > 0.15 || weather.soak > 0.5) return 'décrue'
    return null
}
