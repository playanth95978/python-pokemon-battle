/** Vue à la première personne : la souris oriente le regard, ZQSD avance par rapport à lui (toujours case par case). */
import * as THREE from 'three'
import type { Direction } from '../world/types'

const EYE_HEIGHT = 1.15, FOV = 72, SENSITIVITY = 0.0025, MAX_PITCH = 1.35
/** Directions dans le sens où tourne le regard quand le lacet augmente (vers la gauche). */
const AROUND: Direction[] = ['up', 'left', 'down', 'right']
/** Lacet de la caméra pour regarder dans chaque direction du monde (lacet 0 : vers le nord). */
const FACING_YAW: Record<Direction, number> = {up: 0, left: Math.PI / 2, down: Math.PI, right: -Math.PI / 2}

/** Direction du monde d'une touche (`up` = avancer, `left` = pas de côté…) pour un regard de lacet `yaw`. */
export function relativeDirection(yaw: number, key: Direction) {
    const facing = Math.round(yaw / (Math.PI / 2))
    return AROUND[(((facing + AROUND.indexOf(key)) % 4) + 4) % 4]
}

export function createFirstPersonView(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera) {
    let enabled = false, yaw = 0, pitch = 0
    let active = true
    const thirdPersonFov = camera.fov

    const look = (dx: number, dy: number) => {
        yaw -= dx * SENSITIVITY
        pitch = THREE.MathUtils.clamp(pitch - dy * SENSITIVITY, -MAX_PITCH, MAX_PITCH)
    }
    // Clic : la souris est capturée ; sans capture (refusée par le navigateur), glisser fonctionne aussi.
    canvas.addEventListener('click', () => {
        if (active && enabled && document.pointerLockElement !== canvas) void canvas.requestPointerLock?.()?.catch(() => undefined)
    })
    addEventListener('mousemove', (event) => {
        if (!active || !enabled) return
        if (document.pointerLockElement === canvas || event.buttons & 1) look(event.movementX, event.movementY)
    })

    return {
        /** Suspend les commandes pendant un panneau, sans perdre l'orientation ni le mode FPS. */
        setActive(value: boolean) {
            active = value
            if (!active && document.pointerLockElement === canvas) document.exitPointerLock()
        },
        get enabled() {
            return enabled
        },
        /** Bascule la vue ; on entre en regardant là où le dresseur fait face. */
        toggle(facing: Direction) {
            if (!active) return
            enabled = !enabled
            if (enabled) {
                yaw = FACING_YAW[facing]
                pitch = 0
            } else if (document.pointerLockElement === canvas) {
                document.exitPointerLock()
            }
            camera.fov = enabled ? FOV : thirdPersonFov
            camera.updateProjectionMatrix()
        },
        /** Direction du monde où mène la touche, selon le regard. */
        direction: (key: Direction) => relativeDirection(yaw, key),
        /** Place l'œil sur la tête du dresseur. */
        place(position: THREE.Vector3) {
            camera.position.set(position.x, position.y + EYE_HEIGHT, position.z)
            camera.rotation.set(pitch, yaw, 0, 'YXZ')
        },
    }
}
