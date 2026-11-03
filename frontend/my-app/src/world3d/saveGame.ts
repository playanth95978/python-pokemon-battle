/**
 * Sauvegarde de la partie de Clairbois 3D dans le localStorage : position du dresseur (dehors ou dans le château),
 * objets ramassés, portes ouvertes, Mewtwo vaincu et Pokémon capturés. Lue au lancement de la page, écrite quand on
 * la quitte.
 */
import type { Direction, PlayerState } from '../world/types'
import { canEnter, tileAt, WORLD_MAP } from '../world/worldMap'
import { buildingEntrance } from '../world/buildings'
import { cityStreetAt } from '../world/cityLayout'
import { ITEMS, tileAt as castleTileAt, type Tile } from './castle/castleLayout'

export const SAVE_KEY = 'pokemon-battle.world3d.save'
/** À incrémenter si la forme change : `upgrade` reprend les versions connues, une autre est ignorée plutôt que mal lue. */
export const SAVE_VERSION = 2

export interface CastleProgress {
    inventory: string[]
    opened: string[]
}

export interface SavedGame extends CastleProgress {
    version: typeof SAVE_VERSION
    player: PlayerState
    /** Case du dresseur dans le château, ou null s'il est dehors. */
    castle: (Tile & { facing: Direction }) | null
    bossDefeated: boolean
    /** Espèces capturées (Mewtwo avec la Master Ball). */
    captured: string[]
}

/** Première forme de la sauvegarde, avant le duel final mémorisé : elle reprend avec Mewtwo toujours au trône. */
type SavedGameV1 = Omit<SavedGame, 'version' | 'bossDefeated' | 'captured'> & { version: 1 }

function upgrade(saved: SavedGame | SavedGameV1 | null): SavedGame | null {
    if (saved?.version === 1) return {...saved, version: SAVE_VERSION, bossDefeated: false, captured: []}
    return saved?.version === SAVE_VERSION ? saved : null
}

/** Une nouvelle construction ne doit pas effacer la progression d'une ancienne partie. */
function restorePlayer(player: PlayerState): PlayerState | null {
    if (canEnter(tileAt(WORLD_MAP, player.position), player.travelMode)) return player
    if (player.travelMode !== 'walking') return null
    const {x, y} = player.position
    const building = WORLD_MAP.buildings.find((house) => house.district && x >= house.x && x < house.x + house.width
        && y >= house.y && y < house.y + house.height)
    if (building) return {...player, position: buildingEntrance(building)}
    if (!cityStreetAt(player.position, 2) || !WORLD_MAP.props.some((prop) => prop.x === x && prop.y === y)) return null
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const position = {x: x + dx, y: y + dy}
        if (canEnter(tileAt(WORLD_MAP, position), 'walking')) return {...player, position}
    }
    return null
}

/**
 * Relit la sauvegarde. Elle vient du navigateur et peut dater d'une autre version du jeu : une sauvegarde illisible,
 * d'une autre version, ou dont la case est invalide donne une nouvelle partie. Les nouvelles maisons de la ville
 * replacent le joueur devant leur entrée en conservant la progression.
 */
export function loadGame(storage: Pick<Storage, 'getItem'>): SavedGame | null {
    let saved: SavedGame | null
    try {
        saved = upgrade(JSON.parse(storage.getItem(SAVE_KEY) ?? 'null') as SavedGame | SavedGameV1 | null)
    } catch {
        return null
    }
    if (!saved) return null
    const player = restorePlayer(saved.player)
    if (!player) return null
    const inside = saved.castle && castleTileAt(saved.castle)
    if (inside && inside !== 'floor' && inside !== 'door') return null
    // Un objet retiré du château entre deux versions disparaît simplement du sac.
    return {...saved, player, inventory: saved.inventory.filter((id) => ITEMS.some((item) => item.id === id))}
}

export function saveGame(storage: Pick<Storage, 'setItem'>, game: Omit<SavedGame, 'version'>) {
    try {
        storage.setItem(SAVE_KEY, JSON.stringify({version: SAVE_VERSION, ...game}))
    } catch {
        // Stockage plein ou interdit (navigation privée) : la partie continue, simplement sans sauvegarde.
    }
}

/** Nouvelle partie : la sauvegarde est effacée (le prochain lancement repart du point d'apparition). */
export function clearGame(storage: Pick<Storage, 'removeItem'>) {
    try {
        storage.removeItem(SAVE_KEY)
    } catch {
        // Stockage interdit : il n'y avait de toute façon rien à effacer.
    }
}
