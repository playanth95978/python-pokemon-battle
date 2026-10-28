/**
 * Règles de la quête du château, sans rendu : ce que les objets ramassés apportent en combat, les spectres qui hantent
 * les couloirs et l'issue du duel contre Mewtwo.
 */
import type { CastleState } from './castleLayout'
import { ITEMS, roomAt } from './castleLayout'

/** Niveau et potions du dresseur sans aucun objet (valeurs par défaut du combat côté serveur). */
export const BASE_LEVEL = 50
export const BASE_POTIONS = 2
const MAX_POTIONS = 9

/** Potions supplémentaires apportées par chaque objet de soin ; l'Élixir compte double. */
const POTION_BONUS: Record<string, number> = {potion: 1, 'super-potion': 1, 'hyper-potion': 1, 'max-potion': 1, elixir: 2}
/** Le Super Bonbon fait gagner des niveaux, donc des dégâts. */
const CANDY_LEVELS = 5

export interface BattleBonus {
    first_level: number
    first_potions: number
}

/** Les objets du sac restent acquis : ils s'appliquent à chaque combat sans être consommés. */
export function battleBonus(inventory: readonly string[]): BattleBonus {
    const potions = inventory.reduce((total, id) => total + (POTION_BONUS[id] ?? 0), BASE_POTIONS)
    const candies = inventory.filter((id) => ITEMS.find((item) => item.id === id)?.kind === 'candy').length
    return {first_level: Math.min(100, BASE_LEVEL + candies * CANDY_LEVELS), first_potions: Math.min(MAX_POTIONS, potions)}
}

/** Ce que les objets changent, en clair pour le joueur. */
export function describeBonus(bonus: BattleBonus) {
    const parts = []
    if (bonus.first_level > BASE_LEVEL) parts.push(`niveau ${bonus.first_level}`)
    if (bonus.first_potions > BASE_POTIONS) parts.push(`${bonus.first_potions} potions`)
    return parts.length ? `Grâce à ton sac : ${parts.join(', ')}.` : ''
}

/** Spectres du château (espèces Spectre du catalogue). */
export const GHOSTS = ['gastly', 'haunter', 'misdreavus', 'duskull', 'shuppet']
/** Pas sans rencontre après un combat (ou à l'entrée), puis chance de rencontre à chaque pas. */
export const GHOST_COOLDOWN = 12
export const GHOST_CHANCE = 0.06
/** Mewtwo règne seul au sommet : pas de spectre dans l'antichambre ni dans la salle du trône. */
const HAUNTED_FLOORS = [0, 1]

/**
 * Un spectre surgit-il sur cette case ? `roll` et `pick` sont deux tirages dans [0, 1[ (passés en paramètre pour
 * que la règle reste testable). Renvoie l'espèce, ou null.
 */
export function ghostEncounter(state: CastleState, stepsSinceLast: number, roll: number, pick: number) {
    if (stepsSinceLast < GHOST_COOLDOWN || !HAUNTED_FLOORS.includes(state.floor) || !roomAt(state)) return null
    return roll < GHOST_CHANCE ? GHOSTS[Math.floor(pick * GHOSTS.length)] : null
}

/** Mewtwo vaincu : la Master Ball du sac le capture à coup sûr ; sans elle, il s'enfuit. */
export function capturesBoss(inventory: readonly string[]) {
    return inventory.includes('master-ball')
}
