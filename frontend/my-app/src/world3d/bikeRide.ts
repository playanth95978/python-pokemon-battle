/**
 * Conduite libre à vélo, sans three.js. Pédaler accélère (de moins en moins près de la vitesse de croisière), lâcher
 * laisse rouler en roue libre, freiner arrête puis fait reculer au pas (on pousse le vélo). Tourner braque le guidon,
 * et le cap suit le modèle cinématique du vélo : lacet = vitesse × tan(braquage) / empattement. Le braquage possible
 * se réduit avec la vitesse, comme sur un vrai vélo : on vire serré au pas, large en pleine course. Contre un mur pris
 * de biais, le vélo est dévié et le longe ; de face, il s'arrête net.
 *
 * Cap : 0 vers le sud (+z), positif vers l'est (+x) ; la gauche du cycliste est donc côté cap croissant.
 */
import { WHEELBASE } from './bicycle'

/** Vitesse de croisière (m/s), recul au pas, accélération en pédalant, freinage. */
export const MAX_SPEED = 8.5, REVERSE_SPEED = 1
const PEDAL = 4.5, BRAKE = 8, PUSH = 2
/** Frottements : roulement (m/s²) et air (proportionnel au carré de la vitesse). */
const ROLLING = 0.35, AIR = 0.012
/** Braquage maximal à l'arrêt et en pleine course (rad), vitesse de rotation du guidon (rad/s). */
const STEER_AT_REST = 0.65, STEER_AT_SPEED = 0.16, STEER_RATE = 2.5
/** Distance du centre à la roue qui touche l'obstacle en premier (l'avant en avançant, l'arrière en reculant). */
const WHEEL_REACH = 0.55

export interface BikeState {
    x: number
    z: number
    heading: number
    speed: number
    /** Angle du guidon (positif : à gauche) et vitesse de lacet qui en résulte. */
    steer: number
    yawRate: number
}

export interface BikeInput {
    pedal: boolean
    brake: boolean
    /** +1 : à gauche, −1 : à droite, 0 : tout droit. */
    turn: number
}

export function createRide(x: number, z: number, heading: number): BikeState {
    return {x, z, heading, speed: 0, steer: 0, yawRate: 0}
}

/** Braquage permis à cette vitesse. */
export function maxSteer(speed: number) {
    const t = Math.min(1, Math.abs(speed) / MAX_SPEED)
    return STEER_AT_REST + (STEER_AT_SPEED - STEER_AT_REST) * t
}

/** Avance le vélo de `dt` secondes. `passable` dit si un point du sol est praticable ; `bump` : arrêt net contre un obstacle. */
export function updateRide(state: BikeState, dt: number, input: BikeInput, passable: (x: number, z: number) => boolean): 'bump' | null {
    let speed = state.speed
    if (input.brake && speed > 0.05) speed = Math.max(0, speed - BRAKE * dt)
    else if (input.brake) speed = Math.max(-REVERSE_SPEED, speed - PUSH * dt)
    else if (input.pedal && speed < 0) speed = Math.min(0, speed + BRAKE * dt)
    else if (input.pedal) speed += PEDAL * (1 - speed / MAX_SPEED) * dt
    const drag = (ROLLING + AIR * speed * speed) * dt
    speed -= Math.sign(speed) * Math.min(Math.abs(speed), drag)

    const target = input.turn * maxSteer(speed)
    state.steer += Math.max(-STEER_RATE * dt, Math.min(STEER_RATE * dt, target - state.steer))
    state.yawRate = speed * Math.tan(state.steer) / WHEELBASE
    state.heading += state.yawRate * dt
    state.speed = speed

    const forwardX = Math.sin(state.heading), forwardZ = Math.cos(state.heading)
    const dx = forwardX * speed * dt, dz = forwardZ * speed * dt
    const reach = Math.sign(speed) * WHEEL_REACH
    const free = (x: number, z: number) => passable(x, z) && passable(x + forwardX * reach, z + forwardZ * reach)
    if (speed === 0 || free(state.x + dx, state.z + dz)) {
        state.x += dx
        state.z += dz
        return null
    }
    // De biais contre un mur : le vélo est dévié le long, sur l'axe encore libre, et ne garde que la part de sa
    // vitesse parallèle au mur.
    const direction = Math.sign(speed)
    if (Math.abs(dx) > 1e-6 && free(state.x + dx, state.z)) {
        state.x += dx
        state.speed *= Math.abs(forwardX)
        state.heading = Math.atan2(Math.sign(dx) * direction, 0)
        return null
    }
    if (Math.abs(dz) > 1e-6 && free(state.x, state.z + dz)) {
        state.z += dz
        state.speed *= Math.abs(forwardZ)
        state.heading = Math.atan2(0, Math.sign(dz) * direction)
        return null
    }
    state.speed = 0
    return 'bump'
}
