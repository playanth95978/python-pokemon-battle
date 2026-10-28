/**
 * Sauvegarde de la partie de Clairbois 3D dans le localStorage : position du dresseur (dehors ou dans le château),
 * objets ramassés, portes ouvertes, Mewtwo vaincu et Pokémon capturés. Lue au lancement de la page, écrite quand on
 * la quitte.
 */
import type { Direction, PlayerState } from '../world/types'
import { canEnter, tileAt, WORLD_MAP } from '../world/worldMap'
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

/**
 * Relit la sauvegarde. Elle vient du navigateur et peut dater d'une autre version du jeu : une sauvegarde illisible,
 * d'une autre version, ou dont la case n'est plus praticable (carte modifiée depuis) donne une nouvelle partie.
 */
export function loadGame(storage: Pick<Storage, 'getItem'>): SavedGame | null {
    let saved: SavedGame | null
    try {
        saved = upgrade(JSON.parse(storage.getItem(SAVE_KEY) ?? 'null') as SavedGame | SavedGameV1 | null)
    } catch {
        return null
    }
    if (!saved) return null
    if (!canEnter(tileAt(WORLD_MAP, saved.player.position), saved.player.travelMode)) return null
    const inside = saved.castle && castleTileAt(saved.castle)
    if (inside && inside !== 'floor' && inside !== 'door') return null
    // Un objet retiré du château entre deux versions disparaît simplement du sac.
    return {...saved, inventory: saved.inventory.filter((id) => ITEMS.some((item) => item.id === id))}
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
