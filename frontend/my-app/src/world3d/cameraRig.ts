/**
 * Caméra multi-vues des mondes 3D, qui s'enchaînent avec V :
 * - vue libre : la caméra garde l'angle choisi ; glisser avec la souris la fait tourner autour du dresseur ;
 * - vue de dos : la caméra se replace derrière la tête du dresseur dès qu'il tourne ;
 * - vue FPS : déléguée à firstPerson.ts.
 * Hors FPS, les touches sont relatives à la caméra (Z avance face à l'écran). La direction est figée au moment
 * où la touche est enfoncée : maintenir Q fait marcher droit vers la gauche pendant que la caméra pivote,
 * au lieu de tourner en rond.
 */
import * as THREE from 'three'
import type { Direction } from '../world/types'
import type { createFirstPersonView } from './firstPerson'
import { FACING_YAW, relativeDirection } from './firstPerson'

export type ViewMode = 'free' | 'chase' | 'fps'
export const VIEW_NAMES: Record<ViewMode, string> = {free: 'vue libre', chase: 'vue de dos', fps: 'vue FPS'}
const NEXT: Record<ViewMode, ViewMode> = {free: 'chase', chase: 'fps', fps: 'free'}
const DRAG_SENSITIVITY = 0.006

/** Écart d'angle le plus court de `from` vers `to`, dans ]−π, π]. */
export function angleDelta(from: number, to: number) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

export interface CameraFraming {
    /** Position de la caméra derrière le dresseur, pour une vue tournée vers le nord (lacet 0). */
    offset: THREE.Vector3
    lookHeight: number
    /** Point visé en avant du dresseur, dans l'axe de la vue. */
    lookAhead: number
    /** Part du recul autorisée (0 à 1), par exemple pour ne pas traverser un mur. */
    reach?: (target: THREE.Vector3, offset: THREE.Vector3) => number
    /** Dernière correction de la position visée (par exemple rester au-dessus du relief). */
    adjust?: (goal: THREE.Vector3) => void
}

export function createCameraRig(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, firstPerson: ReturnType<typeof createFirstPersonView>) {
    let mode: ViewMode = 'free'
    // `yaw` : cap de la vue (0 : regard vers le nord) ; `orbit` : décalage choisi à la souris.
    let yaw = 0, orbit = 0
    let lockedYaw: number | null = null
    let active = true
    const goal = new THREE.Vector3(), look = new THREE.Vector3(), rotated = new THREE.Vector3()

    canvas.addEventListener('pointermove', (event) => {
        if (active && mode !== 'fps' && event.buttons & 1) orbit -= event.movementX * DRAG_SENSITIVITY
    })

    const viewYaw = () => yaw + orbit

    /**
     * Position de la caméra pour un cap donné. Quand un obstacle limite le recul, seule la distance horizontale
     * raccourcit : la caméra garde sa hauteur et regarde plus en plongée, au lieu de descendre au ras du sol.
     */
    function place(out: THREE.Vector3, target: THREE.Vector3, angle: number, framing: CameraFraming) {
        rotated.copy(framing.offset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle)
        const reach = framing.reach ? framing.reach(target, rotated) : 1
        return out.set(target.x + rotated.x * reach, target.y + rotated.y, target.z + rotated.z * reach)
    }

    return {
        get mode() {
            return mode
        },
        /** Nom de la vue suivante, pour le HUD. */
        get next() {
            return VIEW_NAMES[NEXT[mode]]
        },
        setActive(value: boolean) {
            active = value
            firstPerson.setActive(value)
        },
        /** Passe à la vue suivante ; la vue de dos et la vue FPS partent du regard du dresseur. */
        cycle(facing: Direction) {
            if (!active) return
            const next = NEXT[mode]
            if (next === 'fps' || mode === 'fps') firstPerson.toggle(facing)
            if (next === 'chase') {
                yaw = FACING_YAW[facing]
                orbit = 0
            }
            if (next === 'free') {
                // On garde l'angle de la vue de dos en revenant à la vue libre.
                yaw = viewYaw()
                orbit = 0
            }
            mode = next
            lockedYaw = null
        },
        /** Une touche de direction vient d'être enfoncée : on fige le repère de la vue. */
        press() {
            lockedYaw = viewYaw()
        },
        release() {
            lockedYaw = null
        },
        /** Direction du monde où mène la touche dans la vue actuelle. */
        direction(key: Direction): Direction {
            if (mode === 'fps') return firstPerson.direction(key)
            return relativeDirection(lockedYaw ?? viewYaw(), key)
        },
        /**
         * Place la caméra : la vue de dos rattrape le regard du dresseur, la vue libre garde son angle. `facing` peut
         * être un lacet de vue (à vélo, le cap n'est plus une des quatre directions) : la vue libre le suit alors aussi,
         * plus lentement, sinon le cycliste finirait de face ou de profil à chaque virage.
         */
        update(delta: number, target: THREE.Vector3, facing: Direction | number, moving: boolean, framing: CameraFraming) {
            if (mode === 'fps') {
                firstPerson.place(target)
                return
            }
            const heading = typeof facing === 'number' ? facing : FACING_YAW[facing]
            if (mode === 'free' && typeof facing === 'number' && moving) {
                yaw += angleDelta(yaw, heading) * (1 - Math.exp(-delta * 1.5))
                orbit *= Math.exp(-delta * 1.5)
            }
            if (mode === 'chase') {
                yaw += angleDelta(yaw, heading) * (1 - Math.exp(-delta * 3.5))
                // En marchant, l'angle choisi à la souris revient doucement derrière le dresseur.
                if (moving) orbit *= Math.exp(-delta * 1.5)
            }
            const angle = viewYaw()
            place(goal, target, angle, framing)
            framing.adjust?.(goal)
            camera.position.lerp(goal, 1 - Math.exp(-delta * 6))
            look.set(-Math.sin(angle), 0, -Math.cos(angle)).multiplyScalar(framing.lookAhead).add(target)
            look.y = target.y + framing.lookHeight
            camera.lookAt(look)
        },
        /** Place la caméra d'un coup (entrée ou sortie d'un bâtiment). */
        snap(target: THREE.Vector3, framing: CameraFraming) {
            if (mode === 'fps') return
            place(camera.position, target, viewYaw(), framing)
        },
    }
}

export type CameraRig = ReturnType<typeof createCameraRig>
