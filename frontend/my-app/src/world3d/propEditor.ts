/**
 * Éditeur de mobilier du développement (POC) : un clic saisit un meuble, les flèches le déplacent de case en case,
 * R le tourne, Échap ou un clic ailleurs le pose. Les changements s'exportent en texte à reporter dans worldMap.ts.
 *
 * Le mobilier d'un chunk est fondu en quelques maillages : le meuble saisi quitte la carte (son chunk est reconstruit
 * sans lui) et suit les flèches comme un objet à part, puis il revient dans la carte là où on le pose.
 */
import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { Direction, Position, Prop, TileType, WorldMap } from '../world/types'
import { PROP_SIZE } from '../world/worldMap'
import type { VillageProps } from './villageProps'

const TURN: Record<Direction, Direction> = {down: 'left', left: 'up', up: 'right', right: 'down'}
/** Un clic qui a bougé de plus de quelques pixels est un glisser de caméra, pas une sélection. */
const CLICK_SLOP = 5
/** Distance maximale entre le point cliqué et le centre d'un meuble pour le saisir. */
const PICK_RADIUS = 1.1

export interface PropEditorTargets {
    scene: THREE.Scene
    camera: THREE.Camera
    canvas: HTMLCanvasElement
    map: WorldMap
    props: VillageProps
    ground: (x: number, z: number) => number
    /** Reconstruit le chunk de cette case. */
    refresh: (tile: Position) => void
    /** Coupe la rotation de la caméra à la souris pendant qu'on tire une flèche. */
    setCameraActive: (active: boolean) => void
}

export function createPropEditor(targets: PropEditorTargets) {
    const {scene, camera, canvas, map} = targets
    // La carte est construite une fois pour toutes ; l'éditeur, outil de développement, la modifie en place.
    const props = map.props as Prop[]
    const tiles = map.tiles as TileType[]
    const size = (prop: Prop) => PROP_SIZE[prop.kind] ?? [1, 1]
    /** Position d'origine (dans worldMap.ts) de chaque meuble déplacé. */
    const origins = new Map<Prop, Prop>()
    /** Case recouverte par un meuble qu'on a posé : on la rend telle quelle quand il repart. */
    const covered = new Map<number, TileType>()

    const controls = new TransformControls(camera, canvas)
    controls.showY = false
    controls.translationSnap = 1
    controls.setSize(0.8)
    controls.enabled = false
    scene.add(controls.getHelper())
    controls.addEventListener('dragging-changed', (event) => targets.setCameraActive(!event.value))

    let enabled = false
    let selected: Prop | null = null
    let proxy: THREE.Group | null = null

    /** Cases du meuble, marquées « mur » comme à la construction de la carte (les cultures restent traversables). */
    function cover(prop: Prop, on: boolean) {
        if (prop.kind === 'crops') return
        const [width, depth] = size(prop)
        for (let y = prop.y; y < prop.y + depth; y++) for (let x = prop.x; x < prop.x + width; x++) {
            const index = y * map.width + x
            if (on) {
                covered.set(index, tiles[index])
                tiles[index] = 'wall'
            } else tiles[index] = covered.get(index) ?? guessGround({x, y})
        }
    }

    /** Sol d'origine d'une case de meuble inconnu : le plus courant autour d'elle (chemin ou herbe en pratique). */
    function guessGround({x, y}: Position): TileType {
        const counts = new Map<TileType, number>()
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const tile = tiles[(y + dy) * map.width + x + dx]
            if (tile && tile !== 'wall') counts.set(tile, (counts.get(tile) ?? 0) + 1)
        }
        return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'grass'
    }

    function buildProxy(prop: Prop) {
        if (proxy) disposeProxy()
        proxy = new THREE.Group()
        // Le meuble est construit à l'origine : le groupe porte sa position, sur un coin de case.
        targets.props.addTo(proxy, [{...prop, x: 0, y: 0}])
        proxy.position.set(prop.x, 0, prop.y)
        scene.add(proxy)
        settle()
        controls.attach(proxy)
    }

    function disposeProxy() {
        controls.detach()
        proxy!.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose() })
        scene.remove(proxy!)
        proxy = null
    }

    /** Garde le meuble saisi posé sur le relief. */
    function settle() {
        if (!proxy || !selected) return
        const [width, depth] = size(selected)
        proxy.position.y = targets.ground(proxy.position.x + width / 2, proxy.position.z + depth / 2)
    }
    controls.addEventListener('objectChange', settle)

    function pick(prop: Prop) {
        drop()
        selected = prop
        if (!origins.has(prop)) origins.set(prop, {...prop})
        props.splice(props.indexOf(prop), 1)
        cover(prop, false)
        targets.refresh(prop)
        buildProxy(prop)
    }

    function drop() {
        if (!selected || !proxy) return
        const prop = selected
        prop.x = Math.round(proxy.position.x)
        prop.y = Math.round(proxy.position.z)
        disposeProxy()
        selected = null
        props.push(prop)
        cover(prop, true)
        targets.refresh(prop)
    }

    function turn() {
        if (!selected) return
        selected.facing = TURN[selected.facing ?? 'down']
        const at = proxy!.position.clone()
        buildProxy(selected)
        proxy!.position.copy(at)
    }

    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2()
    let downAt: { x: number; y: number } | null = null
    canvas.addEventListener('pointerdown', (event) => { downAt = {x: event.clientX, y: event.clientY} })
    canvas.addEventListener('pointerup', (event) => {
        if (!enabled || !downAt || controls.dragging) return
        if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > CLICK_SLOP) return
        // Un clic sur les flèches du meuble saisi n'est pas une nouvelle sélection.
        if (controls.axis) return
        const rect = canvas.getBoundingClientRect()
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
        raycaster.setFromCamera(pointer, camera)
        const decor = scene.children.filter((object) => object.name.startsWith('decor'))
        const hit = raycaster.intersectObjects(decor, true)[0]
        if (!hit) return drop()
        let best: Prop | null = null, bestDistance = PICK_RADIUS
        for (const prop of props) {
            const [width, depth] = size(prop)
            const distance = Math.hypot(prop.x + width / 2 - hit.point.x, prop.y + depth / 2 - hit.point.z)
            if (distance < bestDistance) [best, bestDistance] = [prop, distance]
        }
        if (best) pick(best)
        else drop()
    })
    // Avant les touches du jeu : R tourne le meuble saisi, Échap le pose.
    addEventListener('keydown', (event) => {
        if (!selected) return
        const key = event.key.toLowerCase()
        if (key !== 'r' && key !== 'escape') return
        event.stopImmediatePropagation()
        if (key === 'r') turn()
        else drop()
    }, true)

    return {
        get enabled() { return enabled },
        get selected() { return selected },
        set enabled(value: boolean) {
            enabled = value
            controls.enabled = value
            if (!value) drop()
        },
        /** Meubles déplacés, une ligne chacun : sorte, position d'origine, nouvelle position (et orientation). */
        changes() {
            const lines: string[] = []
            for (const [prop, origin] of origins) {
                if (prop.x === origin.x && prop.y === origin.y && prop.facing === origin.facing) continue
                const facing = prop.facing !== origin.facing ? `, facing: '${prop.facing}'` : ''
                lines.push(`${prop.kind} (${origin.x}, ${origin.y}${origin.facing ? ` ${origin.facing}` : ''}) → { x: ${prop.x}, y: ${prop.y}${facing} }`)
            }
            return lines.join('\n') || 'Aucun meuble déplacé.'
        },
    }
}
