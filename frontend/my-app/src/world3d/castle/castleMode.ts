/**
 * Le château en jeu : sa propre scène (intérieur sombre, torches, brouillard), son post-traitement, les pas
 * du dresseur case par case, le ramassage des objets, les portes à clé, les escaliers et Mewtwo.
 * Clairbois (main.ts) délègue tout ici tant que le dresseur est à l'intérieur.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { Direction } from '../../world/types'
import { createPostProcessing } from '../postProcessing'
import type { Gait } from '../scenery'
import type { CastleEvent, CastleState, Tile } from './castleLayout'
import { blocksCamera, BOSS, enterCastle, FLOOR_NAMES, ITEMS, moveInCastle, nearBoss, roomAt, ROOMS } from './castleLayout'
import { buildCastleInterior, ROOM_THEMES, roomLightPosition } from './castleInterior'
import type { CastleMaterials } from './castleMaterials'

const STEP_DURATION = 190
const LIGHT_POOL = 6
/** Multiplicateur des sources proches (torches, âtre…) et force de l'éclairage d'ambiance d'une pièce de 70 cases. */
const LIGHT_SCALE = 3.6, ROOM_LIGHT = 9
const ANGLES: Record<Direction, number> = {down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2}
const MESSAGE_MS = 3200

type Trainer = THREE.Object3D & { animate: (delta: number, gait: Gait) => void }

export function createCastle(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, materials: CastleMaterials) {
    const scene = new THREE.Scene()
    // Brouillard chaud et lointain : il donne de la profondeur sans plonger les pièces dans le noir.
    scene.background = new THREE.Color(0x1c1814)
    scene.fog = new THREE.Fog(0x2a2420, 18, 48)
    // Reflets doux pour le marbre, l'or et le métal : une pièce neutre, atténuée.
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.45
    // Lumière de fond : on distingue toujours les murs, les sols et le mobilier, même loin des torches.
    scene.add(new THREE.AmbientLight(0xa39486, 0.55), new THREE.HemisphereLight(0xd8d0c4, 0x4a3828, 0.6))

    const interior = buildCastleInterior(materials)
    interior.floors.forEach(({group}) => scene.add(group))

    // Éclairage d'ambiance de chaque pièce de l'étage (lustre ou jour des fenêtres), à la couleur de son thème.
    // Quatre lumières au plus par étage ; le nombre ne change jamais, les shaders ne sont pas recompilés.
    const roomLights = Array.from({length: 4}, () => {
        const light = new THREE.PointLight(0xffffff, 0, 0, 1.3)
        scene.add(light)
        return light
    })

    // Réserve fixe de lumières : le nombre de lumières ne change jamais, les shaders ne sont pas recompilés.
    // Pas d'ombre de lumière ponctuelle (carte cubique) : sur certains GPU NVIDIA, son shader empêchait tous les
    // matériaux éclairés de s'afficher (pièces noires). L'occlusion ambiante du post-traitement ancre les objets.
    const pool = Array.from({length: LIGHT_POOL}, () => {
        const light = new THREE.PointLight(0xff9a45, 0, 13, 2)
        scene.add(light)
        return light
    })
    const post = createPostProcessing(renderer, scene, camera)

    let state: CastleState | null = null
    /** Objets ramassés et portes ouvertes : ils restent acquis quand on sort du château et qu'on y revient. */
    let progress: Pick<CastleState, 'inventory' | 'opened'> = {inventory: [], opened: []}
    let trainer: Trainer | null = null, follower: THREE.Object3D | null = null
    let restore: { parent: THREE.Object3D; object: THREE.Object3D }[] = []
    let stepStart = -Infinity
    const from = new THREE.Vector3(), to = new THREE.Vector3(), followerFrom = new THREE.Vector3(), followerTo = new THREE.Vector3()
    let message = {text: '', until: 0}
    const doorOpening = new Map<string, number>()
    const pickedAt = new Map<string, number>()
    const sample = new THREE.Vector3()

    // Chaque étage est dessiné à hauteur 0 et seul l'étage courant est visible : pas besoin d'altitude par étage.
    const center = (x: number, z: number) => new THREE.Vector3(x + 0.5, 0, z + 0.5)

    function showFloor(floor: number) {
        interior.floors.forEach(({group}, index) => { group.visible = index === floor })
        const rooms = ROOMS.filter((room) => room.floor === floor)
        roomLights.forEach((light, index) => {
            const room = rooms[index]
            light.intensity = room ? ROOM_LIGHT * ROOM_THEMES[room.id].fill * Math.sqrt(room.width * room.depth / 70) : 0
            if (!room) return
            light.color.setHex(ROOM_THEMES[room.id].light)
            light.position.copy(roomLightPosition(room))
        })
    }

    function say(text: string, now: number) {
        message = {text, until: now + MESSAGE_MS}
    }

    function describe(event: CastleEvent, current: CastleState) {
        switch (event.type) {
            case 'pickup': return `Tu as trouvé : ${event.item.name} !`
            case 'locked': return `La porte est fermée à clé. Il faut la ${ITEMS.find((item) => item.id === event.door.key)?.name ?? 'clé'}.`
            case 'unlocked': return `La ${ITEMS.find((item) => item.id === event.door.key)?.name} tourne dans la serrure : la porte s'ouvre.`
            case 'stairs': return event.stairs.up ? `Tu montes : ${FLOOR_NAMES[current.floor]}.` : `Tu descends : ${FLOOR_NAMES[current.floor]}.`
            default: return null
        }
    }

    /** Recul de la caméra limité au premier mur ou grand meuble rencontré : elle reste dans la pièce du joueur. */
    function cameraDistance(player: THREE.Vector3, offset: THREE.Vector3) {
        // La caméra reste dans la pièce du dresseur : elle ne passe ni un mur, ni une porte (même fermée).
        const home = roomAt({floor: state!.floor, x: Math.floor(player.x), z: Math.floor(player.z)})
        let allowed = 0
        for (let t = 0.05; t <= 1.0001; t += 0.05) {
            sample.copy(player).addScaledVector(offset, t)
            const tile = {floor: state!.floor, x: Math.floor(sample.x), z: Math.floor(sample.z)}
            if (blocksCamera(tile) || (home && roomAt(tile)?.id !== home.id)) break
            allowed = t
        }
        // 45 cm de marge avant l'obstacle : tableaux, torches et bannières dépassent du mur.
        const margin = 0.45 / Math.max(0.5, Math.hypot(offset.x, offset.z))
        return Math.max(0.12, allowed - margin)
    }

    return {
        scene,
        get active() {
            return state !== null
        },
        get state() {
            return state
        },
        progress: () => materials.progress(),
        /** Objets ramassés et portes ouvertes, dedans comme dehors (pour la sauvegarde). */
        bag: () => (state ? {inventory: state.inventory, opened: state.opened} : progress),
        /** Reprend une partie sauvegardée, avant toute entrée dans le château. */
        load(saved: Pick<CastleState, 'inventory' | 'opened'>) {
            progress = {inventory: [...saved.inventory], opened: [...saved.opened]}
        },
        /**
         * Fait entrer le dresseur (et son compagnon) par la grande porte, dans le hall ; avec `resume`, il réapparaît
         * sur la case sauvegardée.
         */
        enter(player: Trainer, companion: THREE.Object3D | null, now: number, resume?: Tile & { facing: Direction }) {
            state = resume ? {...resume, ...progress} : enterCastle(progress)
            // Les portes déjà ouvertes le sont d'emblée, sans rejouer leur animation.
            state.opened.forEach((door) => doorOpening.set(door, -Infinity))
            trainer = player
            follower = companion
            restore = [player, companion].filter((object): object is THREE.Object3D => !!object?.parent)
                .map((object) => ({parent: object.parent!, object}))
            restore.forEach(({object}) => scene.add(object))
            from.copy(center(state.x, state.z))
            to.copy(from)
            // Le compagnon attend une case derrière la porte ; à la reprise, il part de la case du dresseur.
            followerFrom.copy(from).x -= resume ? 0 : 1
            followerTo.copy(followerFrom)
            player.rotation.y = ANGLES[state.facing]
            player.position.copy(from)
            showFloor(state.floor)
            const room = roomAt(state)!
            say(`Château de Clairbois — ${room.name}. ${room.description}`, now)
        },
        /** Rend le dresseur à Clairbois ; l'appelant le replace devant la porte. */
        leave() {
            restore.forEach(({parent, object}) => parent.add(object))
            restore = []
            if (state) progress = {inventory: state.inventory, opened: state.opened}
            state = null
        },
        /** Un pas (touche maintenue) ; renvoie l'évènement pour que Clairbois gère la sortie. */
        step(direction: Direction, now: number): CastleEvent | null {
            if (!state || now - stepStart < STEP_DURATION) return null
            const previous = state
            const {state: next, event} = moveInCastle(state, direction)
            state = next
            const text = describe(event, next)
            if (text) say(text, now)
            if (event.type === 'unlocked') doorOpening.set(event.door.id, now)
            if (event.type === 'pickup') pickedAt.set(event.item.id, now)
            if (event.type === 'moved' || event.type === 'pickup') {
                followerFrom.copy(followerTo)
                followerTo.copy(center(previous.x, previous.z))
                from.copy(to)
                to.copy(center(next.x, next.z))
                stepStart = now
            } else if (event.type === 'stairs') {
                // Changement d'étage : on réapparaît en haut (ou en bas) de l'escalier, compagnon sur les talons.
                showFloor(next.floor)
                from.copy(center(next.x, next.z))
                to.copy(from)
                // La case de l'escalier est une trémie : le compagnon arrive sur la case du dresseur et le suit au pas suivant.
                followerFrom.copy(from)
                followerTo.copy(from)
                stepStart = now - STEP_DURATION
                const room = roomAt(next)
                if (room) say(`${describe(event, next)} ${room.name} : ${room.description}`, now)
            }
            return event
        },
        nearBoss: () => !!state && nearBoss(state),
        boss: {speciesKey: BOSS.speciesKey, name: BOSS.name, position: {x: BOSS.x, y: BOSS.z}},
        /** Anime le château et place le dresseur ; la caméra est placée par cameraRig.ts. */
        update(now: number, delta: number) {
            if (!state || !trainer) return
            const time = now / 1000
            const progress = Math.min(1, (now - stepStart) / STEP_DURATION)
            trainer.position.lerpVectors(from, to, progress)
            trainer.rotation.y = THREE.MathUtils.lerp(trainer.rotation.y, ANGLES[state.facing], 0.25)
            trainer.animate(delta, now - stepStart < STEP_DURATION + 60 ? 'walk' : 'idle')
            if (follower) {
                follower.position.lerpVectors(followerFrom, followerTo, progress)
                const dx = followerTo.x - followerFrom.x, dz = followerTo.z - followerFrom.z
                if (dx * dx + dz * dz > 0.01) follower.rotation.y = Math.atan2(dx, dz)
            }

            // Objets : ils flottent et tournent ; ramassés, ils montent en tourbillonnant puis disparaissent.
            for (const item of ITEMS) {
                const mesh = interior.items.get(item.id)!
                const picked = pickedAt.get(item.id)
                if (picked !== undefined) {
                    const t = (now - picked) / 600
                    mesh.visible = t < 1
                    mesh.position.y = 0.55 + t * 1.2
                    mesh.scale.setScalar(Math.max(0.01, 1 - t))
                    mesh.rotation.y += delta * 14
                    continue
                }
                mesh.visible = !state.inventory.includes(item.id)
                mesh.position.y = 0.55 + Math.sin(time * 2 + item.x) * 0.08
                mesh.rotation.y = time * 1.4 + item.z
            }
            for (const [door, started] of doorOpening) {
                const pivot = interior.lockedDoors.get(door)!
                const base = pivot.userData.baseRotation ?? (pivot.userData.baseRotation = pivot.rotation.y)
                pivot.rotation.y = base - Math.min(1, (now - started) / 700) * Math.PI / 2
            }
            interior.boss.update(time)

            // Les flammes de l'étage vacillent ; les lumières réelles vont aux sources les plus proches.
            const floor = interior.floors[state.floor]
            floor.flames.forEach((flame, index) => {
                flame.scale.y = flame.scale.x * (0.85 + 0.25 * Math.abs(Math.sin(time * (7 + index % 5) + index)))
            })
            const sources = floor.lights
                .filter((source) => source.visible && (source.parent?.visible ?? true))
                .map((source) => ({source, position: source.getWorldPosition(new THREE.Vector3())}))
                .sort((a, b) => a.position.distanceToSquared(trainer!.position) - b.position.distanceToSquared(trainer!.position))
            pool.forEach((light, index) => {
                const entry = sources[index]
                if (!entry) {
                    light.intensity = 0
                    return
                }
                const {intensity, color} = entry.source.userData.light as { intensity: number; color: number }
                light.position.copy(entry.position)
                light.color.setHex(color)
                light.intensity = intensity * LIGHT_SCALE * (0.88 + 0.12 * Math.sin(time * 8.3 + index * 1.7) * Math.sin(time * 5.1 + index))
            })
        },
        /** Part du recul de caméra possible avant un mur ou un grand meuble (voir cameraRig.ts). */
        cameraReach: (target: THREE.Vector3, offset: THREE.Vector3) => state ? cameraDistance(target, offset) : 1,
        render: () => post.render(),
        setSize: (width: number, height: number) => post.setSize(width, height),
        setPixelRatio: (ratio: number) => post.setPixelRatio(ratio),
        /** Texte du HUD : pièce, étage, dernier évènement, sac et actions possibles. */
        hud(now: number, viewHelp: string) {
            if (!state) return ''
            const room = roomAt(state)
            const bag = ITEMS.filter((item) => state!.inventory.includes(item.id)).map((item) => item.name)
            return `<strong>Château de Clairbois — ${room?.name ?? 'Grande porte'}</strong>`
                + `<p>${FLOOR_NAMES[state.floor]}</p>`
                + (now < message.until ? `<p><b>${message.text}</b></p>` : '')
                + (nearBoss(state) ? '<p><b>Mewtwo</b> — E : l’affronter !</p>' : '')
                + `<p>Sac (${bag.length}/${ITEMS.length}) : ${bag.length ? bag.join(', ') : 'vide'}</p>`
                + `<p class="world3d-help">Flèches / ZQSD pour marcher · ${viewHelp} · la grande porte du hall ramène à Clairbois</p>`
        },
    }
}

export type Castle = ReturnType<typeof createCastle>
