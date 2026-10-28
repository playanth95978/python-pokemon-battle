/**
 * Plan du château de Clairbois, sans rendu : trois étages de 24 × 18 cases, dix pièces, portes, portes
 * fermées à clé, escaliers, objets à ramasser, mobilier qui bloque le passage et Mewtwo au sommet.
 * Le rendu 3D (castleInterior.ts) et les déplacements lisent tous ce même plan.
 */
import type { Direction } from '../../world/types'

export const FLOOR_WIDTH = 24
export const FLOOR_DEPTH = 18
export const FLOOR_NAMES = ['Rez-de-chaussée', 'Premier étage', 'Sommet du donjon']

export type RoomStyle = 'stone' | 'wood' | 'marble'
export interface CastleRoom {
    id: string
    name: string
    description: string
    floor: number
    x: number
    z: number
    width: number
    depth: number
    style: RoomStyle
    /** Tapis central (axe de la pièce), le long de x ou de z. */
    carpet?: 'x' | 'z'
}

export interface Tile { floor: number; x: number; z: number }

export type ItemKind = 'potion' | 'key' | 'ball' | 'stone' | 'candy'
/** `reward` : objet qui n'est pas posé au sol, mais remis par une énigme (sa case est celle où il apparaît). */
export interface CastleItem extends Tile { id: string; name: string; kind: ItemKind; color: number; reward?: true }

/** `key` : porte fermée à clé ; `secret` : pan de mur qui ne s'ouvre qu'en le poussant (E juste à côté). */
export interface CastleDoor extends Tile { id: string; key?: string; secret?: true }
export interface CastleStairs extends Tile { to: Tile; facing: Direction; up: boolean }

export type PropKind = 'pillar' | 'armorStand' | 'weaponRack' | 'table' | 'longTable' | 'barrel' | 'hearth' | 'shelf'
    | 'altar' | 'pew' | 'bed' | 'wardrobe' | 'desk' | 'statue' | 'chest' | 'brazier' | 'throne'
export interface CastleProp extends Tile { kind: PropKind; width?: number; depth?: number; rotation?: number }

export const ROOMS: CastleRoom[] = [
    {id: 'hall', name: 'Grand hall', description: 'Des piliers soutiennent une voûte noircie par les torches.', floor: 0, x: 1, z: 9, width: 10, depth: 8, style: 'stone', carpet: 'x'},
    {id: 'armory', name: 'Salle d’armes', description: 'Armures et lances attendent des chevaliers disparus.', floor: 0, x: 1, z: 1, width: 10, depth: 7, style: 'stone'},
    {id: 'kitchen', name: 'Cuisines', description: 'L’âtre fume encore ; quelqu’un vit ici.', floor: 0, x: 12, z: 9, width: 11, depth: 8, style: 'stone'},
    {id: 'library', name: 'Bibliothèque', description: 'Des grimoires sur les Pokémon légendaires… et un escalier. Un courant d’air froid filtre du mur ouest.', floor: 0, x: 12, z: 1, width: 11, depth: 7, style: 'wood'},
    {id: 'gallery', name: 'Galerie des portraits', description: 'Les seigneurs de Clairbois te suivent du regard.', floor: 1, x: 12, z: 1, width: 11, depth: 7, style: 'wood', carpet: 'x'},
    {id: 'chapel', name: 'Chapelle', description: 'Un vitrail violet baigne l’autel d’une lumière étrange.', floor: 1, x: 1, z: 1, width: 10, depth: 7, style: 'stone', carpet: 'z'},
    {id: 'bedroom', name: 'Chambre du seigneur', description: 'Le lit est fait. Le seigneur, lui, a disparu.', floor: 1, x: 1, z: 9, width: 10, depth: 8, style: 'wood', carpet: 'z'},
    {id: 'treasury', name: 'Salle du trésor', description: 'Des coffres débordent d’or. Un escalier monte vers le sommet.', floor: 1, x: 12, z: 9, width: 11, depth: 8, style: 'marble'},
    {id: 'antechamber', name: 'Antichambre', description: 'Une pression psychique te serre les tempes.', floor: 2, x: 12, z: 9, width: 11, depth: 8, style: 'marble', carpet: 'x'},
    {id: 'throne', name: 'Salle du trône', description: 'Sur le trône, quelque chose t’attendait.', floor: 2, x: 1, z: 1, width: 10, depth: 16, style: 'marble', carpet: 'z'},
]

export const DOORS: CastleDoor[] = [
    {id: 'hall-armory', floor: 0, x: 5, z: 8},
    {id: 'hall-kitchen', floor: 0, x: 11, z: 12},
    {id: 'kitchen-library', floor: 0, x: 17, z: 8},
    {id: 'gallery-chapel', floor: 1, x: 11, z: 4},
    {id: 'chapel-bedroom', floor: 1, x: 5, z: 8},
    {id: 'gallery-treasury', floor: 1, x: 17, z: 8, key: 'silver-key'},
    {id: 'secret-passage', floor: 0, x: 11, z: 6, secret: true},
    {id: 'antechamber-throne', floor: 2, x: 11, z: 12, key: 'gold-key'},
]

export const STAIRS: CastleStairs[] = [
    {floor: 0, x: 22, z: 2, to: {floor: 1, x: 21, z: 2}, facing: 'left', up: true},
    {floor: 1, x: 22, z: 2, to: {floor: 0, x: 21, z: 2}, facing: 'left', up: false},
    {floor: 1, x: 22, z: 15, to: {floor: 2, x: 21, z: 15}, facing: 'left', up: true},
    {floor: 2, x: 22, z: 15, to: {floor: 1, x: 21, z: 15}, facing: 'left', up: false},
]

/** Grande porte du hall vers Clairbois. */
export const EXIT: Tile = {floor: 0, x: 0, z: 12}
export const ENTRANCE: Tile = {floor: 0, x: 1, z: 12}

export const ITEMS: CastleItem[] = [
    {id: 'potion', name: 'Potion', kind: 'potion', color: 0x9b59d0, floor: 0, x: 3, z: 4},
    {id: 'super-potion', name: 'Super Potion', kind: 'potion', color: 0xf0c419, floor: 0, x: 20, z: 14},
    {id: 'rare-candy', name: 'Super Bonbon', kind: 'candy', color: 0x5dade2, floor: 0, x: 14, z: 5},
    {id: 'moon-stone', name: 'Pierre Lune', kind: 'stone', color: 0x8e9eb8, floor: 1, x: 5, z: 3},
    {id: 'silver-key', name: 'Clé d’argent', kind: 'key', color: 0xd9dde3, floor: 1, x: 3, z: 14},
    {id: 'hyper-potion', name: 'Hyper Potion', kind: 'potion', color: 0xe74c8b, floor: 1, x: 15, z: 6},
    // Remise par l'autel de la chapelle quand on y dépose la Pierre Lune.
    {id: 'gold-key', name: 'Clé d’or', kind: 'key', color: 0xf5c542, floor: 1, x: 5, z: 2, reward: true},
    {id: 'elixir', name: 'Élixir', kind: 'potion', color: 0xf39c12, floor: 1, x: 20, z: 11},
    {id: 'master-ball', name: 'Master Ball', kind: 'ball', color: 0x7d3cb5, floor: 2, x: 15, z: 12},
    // Cachée dans l'épaisseur du mur, derrière le passage secret.
    {id: 'max-potion', name: 'Potion Max', kind: 'potion', color: 0x3fd0c9, floor: 0, x: 11, z: 6},
]

/** Autel de la chapelle : un creux en croissant de lune attend la Pierre Lune. */
export const ALTAR = {floor: 1, x: 4, z: 1, width: 3, stone: 'moon-stone', reward: 'gold-key'}

export const BOSS = {speciesKey: 'mewtwo', name: 'Mewtwo', floor: 2, x: 5, z: 6, width: 2}

/** Mobilier : les meubles marqués occupent leurs cases ; le joueur les contourne. */
export const PROPS: CastleProp[] = [
    ...[[3, 10], [8, 10], [3, 15], [8, 15]].map(([x, z]) => ({kind: 'pillar' as const, floor: 0, x, z})),
    ...[2, 4, 6, 8].map((x) => ({kind: 'armorStand' as const, floor: 0, x, z: 1})),
    {kind: 'weaponRack', floor: 0, x: 10, z: 3, depth: 3, rotation: -Math.PI / 2},
    {kind: 'table', floor: 0, x: 5, z: 5, width: 2},
    {kind: 'longTable', floor: 0, x: 15, z: 12, width: 4},
    ...[[22, 16], [21, 16], [22, 14]].map(([x, z]) => ({kind: 'barrel' as const, floor: 0, x, z})),
    {kind: 'hearth', floor: 0, x: 16, z: 16, width: 3},
    ...[13, 14, 15, 16, 18, 19, 20].map((x) => ({kind: 'shelf' as const, floor: 0, x, z: 1})),
    {kind: 'desk', floor: 0, x: 17, z: 5, width: 2},
    {kind: 'altar', floor: 1, x: 4, z: 1, width: 3},
    ...[[2, 4], [7, 4], [2, 6], [7, 6]].map(([x, z]) => ({kind: 'pew' as const, floor: 1, x, z, width: 2})),
    {kind: 'bed', floor: 1, x: 2, z: 10, width: 2, depth: 3},
    {kind: 'wardrobe', floor: 1, x: 9, z: 9},
    {kind: 'desk', floor: 1, x: 8, z: 15, width: 2},
    ...[[14, 2], [18, 2]].map(([x, z]) => ({kind: 'statue' as const, floor: 1, x, z})),
    ...[[13, 10], [16, 10], [13, 16], [19, 16]].map(([x, z]) => ({kind: 'chest' as const, floor: 1, x, z})),
    ...[[12, 11], [12, 13]].map(([x, z]) => ({kind: 'statue' as const, floor: 2, x, z})),
    ...[[14, 9], [20, 9], [14, 16], [20, 16]].map(([x, z]) => ({kind: 'brazier' as const, floor: 2, x, z})),
    ...[[2, 5], [9, 5], [2, 9], [9, 9], [2, 13], [9, 13]].map(([x, z]) => ({kind: 'pillar' as const, floor: 2, x, z})),
    {kind: 'throne', floor: 2, x: 5, z: 2, width: 2},
]

const key = ({floor, x, z}: Tile) => `${floor}:${x}:${z}`
const inside = (room: CastleRoom, {floor, x, z}: Tile) =>
    room.floor === floor && x >= room.x && x < room.x + room.width && z >= room.z && z < room.z + room.depth

export function roomAt(tile: Tile) {
    return ROOMS.find((room) => inside(room, tile)) ?? null
}

/** Cases occupées par un meuble, par Mewtwo ou par le trône. */
const BLOCKED = new Set<string>([
    ...PROPS.flatMap((prop) => Array.from({length: (prop.width ?? 1) * (prop.depth ?? 1)}, (_, index) =>
        key({floor: prop.floor, x: prop.x + index % (prop.width ?? 1), z: prop.z + Math.floor(index / (prop.width ?? 1))}))),
    ...Array.from({length: BOSS.width}, (_, index) => key({floor: BOSS.floor, x: BOSS.x + index, z: BOSS.z})),
])

/** Meubles assez hauts pour masquer le dresseur : la caméra ne recule pas à travers eux. */
const TALL: PropKind[] = ['pillar', 'shelf', 'wardrobe', 'statue', 'armorStand', 'bed', 'hearth', 'throne', 'weaponRack']
const TALL_TILES = new Set(PROPS.filter((prop) => TALL.includes(prop.kind)).flatMap((prop) =>
    Array.from({length: (prop.width ?? 1) * (prop.depth ?? 1)}, (_, index) =>
        key({floor: prop.floor, x: prop.x + index % (prop.width ?? 1), z: prop.z + Math.floor(index / (prop.width ?? 1))}))))

/** La case arrête la caméra : mur ou grand meuble. */
export function blocksCamera(tile: Tile) {
    return tileAt(tile) === 'wall' || TALL_TILES.has(key(tile))
}

export type CastleTile = 'wall' | 'floor' | 'door' | 'stairs' | 'exit' | 'blocked'

export function tileAt(tile: Tile): CastleTile {
    if (key(tile) === key(EXIT)) return 'exit'
    if (STAIRS.some((stairs) => key(stairs) === key(tile))) return 'stairs'
    if (DOORS.some((door) => key(door) === key(tile))) return 'door'
    if (!roomAt(tile)) return 'wall'
    return BLOCKED.has(key(tile)) ? 'blocked' : 'floor'
}

export interface CastleState extends Tile {
    facing: Direction
    inventory: string[]
    opened: string[]
}

export type CastleEvent =
    | {type: 'moved'}
    | {type: 'blocked'}
    | {type: 'locked'; door: CastleDoor}
    | {type: 'unlocked'; door: CastleDoor}
    | {type: 'stairs'; stairs: CastleStairs}
    | {type: 'exit'}
    | {type: 'pickup'; item: CastleItem}
    | {type: 'hollow'; door: CastleDoor}
    | {type: 'secret'; door: CastleDoor}
    | {type: 'altar'}
    | {type: 'riddle'; item: CastleItem}

const STEP: Record<Direction, [number, number]> = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]}

/** Entrée par la grande porte ; les objets déjà ramassés et les portes déjà ouvertes le restent. */
export function enterCastle(progress: Pick<CastleState, 'inventory' | 'opened'> = {inventory: [], opened: []}): CastleState {
    return {...ENTRANCE, facing: 'right', inventory: [...progress.inventory], opened: [...progress.opened]}
}

/**
 * Un pas dans le château. Une porte fermée s'ouvre si l'on a sa clé (le pas suivant la franchit) ;
 * un escalier téléporte à l'étage voisin ; un objet sur la case d'arrivée est ramassé.
 */
export function moveInCastle(state: CastleState, direction: Direction): {state: CastleState; event: CastleEvent} {
    const [dx, dz] = STEP[direction]
    const target: Tile = {floor: state.floor, x: state.x + dx, z: state.z + dz}
    const turned = {...state, facing: direction}
    const kind = tileAt(target)
    if (kind === 'wall' || kind === 'blocked') return {state: turned, event: {type: 'blocked'}}
    if (kind === 'exit') return {state: turned, event: {type: 'exit'}}
    if (kind === 'door') {
        const door = DOORS.find((candidate) => key(candidate) === key(target))!
        if (door.secret && !state.opened.includes(door.id)) return {state: turned, event: {type: 'hollow', door}}
        if (door.key && !state.opened.includes(door.id)) {
            if (!state.inventory.includes(door.key)) return {state: turned, event: {type: 'locked', door}}
            return {state: {...turned, opened: [...state.opened, door.id]}, event: {type: 'unlocked', door}}
        }
    }
    if (kind === 'stairs') {
        const stairs = STAIRS.find((candidate) => key(candidate) === key(target))!
        return {state: {...turned, ...stairs.to, facing: stairs.facing}, event: {type: 'stairs', stairs}}
    }
    const moved = {...turned, ...target}
    const item = ITEMS.find((candidate) => !candidate.reward && key(candidate) === key(target) && !state.inventory.includes(candidate.id))
    if (item) return {state: {...moved, inventory: [...state.inventory, item.id]}, event: {type: 'pickup', item}}
    return {state: moved, event: {type: 'moved'}}
}

const nextTo = (state: Tile, tile: Tile) => state.floor === tile.floor && Math.abs(state.x - tile.x) + Math.abs(state.z - tile.z) === 1

/**
 * E : pousser un pan de mur creux voisin (il pivote et ouvre le passage secret), ou toucher l'autel de la chapelle,
 * qui échange la Pierre Lune contre la Clé d'or. Rien à faire ici : null.
 */
export function interact(state: CastleState): {state: CastleState; event: CastleEvent} | null {
    const secret = DOORS.find((door) => door.secret && !state.opened.includes(door.id) && nextTo(state, door))
    if (secret) return {state: {...state, opened: [...state.opened, secret.id]}, event: {type: 'secret', door: secret}}
    const altar = Array.from({length: ALTAR.width}, (_, index) => ({floor: ALTAR.floor, x: ALTAR.x + index, z: ALTAR.z}))
    if (!altar.some((tile) => nextTo(state, tile))) return null
    const reward = ITEMS.find((item) => item.id === ALTAR.reward)!
    if (!state.inventory.includes(ALTAR.stone) || state.inventory.includes(reward.id)) return {state, event: {type: 'altar'}}
    return {state: {...state, inventory: [...state.inventory, reward.id]}, event: {type: 'riddle', item: reward}}
}

/** Assez près de Mewtwo pour l'affronter (deux cases au plus de l'une de ses cases). */
export function nearBoss(state: CastleState) {
    if (state.floor !== BOSS.floor) return false
    return Array.from({length: BOSS.width}, (_, index) => Math.abs(state.x - BOSS.x - index) + Math.abs(state.z - BOSS.z))
        .some((distance) => distance <= 2)
}

export function isDoorOpen(state: CastleState, door: CastleDoor) {
    return !door.key || state.opened.includes(door.id)
}
