/**
 * Armes du dresseur dans le monde ouvert, sans three.js : choix de la cible devant soi, dégâts, mort, puis retour à la
 * vie quelques heures de jeu plus tard (les habitants chez eux, les Pokémon à leur place) pour que le village ne reste
 * pas vide. Les cibles sont des points en cases ; main.ts les construit à partir des habitants et des Pokémon.
 */

export type WeaponId = 'fists' | 'sword' | 'bow'

export interface Weapon {
    id: WeaponId
    name: string
    /** Touche de sélection directe. */
    key: string
    damage: number
    /** Portée en cases, depuis le centre du dresseur. */
    range: number
    /** Demi-angle du cône visé (radians) : large pour un coup d'épée, étroit pour une flèche. */
    cone: number
    /** Délai minimal entre deux coups, en secondes. */
    cooldown: number
    /** Délai entre le début de l'animation et l'impact (lame qui s'abat, flèche qui file). */
    impact: number
}

export const WEAPONS: Weapon[] = [
    {id: 'fists', name: 'Poings', key: '1', damage: 8, range: 1.4, cone: 0.9, cooldown: 0.5, impact: 0.18},
    {id: 'sword', name: 'Épée', key: '2', damage: 30, range: 1.9, cone: 1.2, cooldown: 0.8, impact: 0.3},
    {id: 'bow', name: 'Arc', key: '3', damage: 45, range: 14, cone: 0.14, cooldown: 1.1, impact: 0.35},
]
export const weaponById = (id: WeaponId) => WEAPONS.find((weapon) => weapon.id === id)!

/** Heures de jeu avant qu'un être tué revienne. */
export const REVIVE_HOURS = 8

export type TargetKind = 'villager' | 'pokemon' | 'guard' | 'player'

export interface Target {
    id: string
    kind: TargetKind
    name: string
    /** Centre en cases (case + 0,5), comme le dresseur. */
    x: number
    y: number
    /** Points de vie quand il est en pleine forme. */
    maxHealth: number
}

export interface Life {
    health: Map<string, number>
    /** Êtres morts, et heures de jeu restantes avant leur retour. */
    dead: Map<string, number>
}

export const createLife = (): Life => ({health: new Map(), dead: new Map()})
export const isDead = (life: Life, id: string) => life.dead.has(id)

/**
 * Cible la plus proche dans le cône de l'arme, devant le dresseur. `heading` est un vecteur unitaire en cases.
 * Les morts sont ignorés.
 */
export function aimAt(life: Life, weapon: Weapon, origin: { x: number; y: number }, heading: { x: number; y: number }, targets: Target[]): Target | null {
    let best: Target | null = null, bestDistance = Infinity
    for (const target of targets) {
        if (isDead(life, target.id)) continue
        const dx = target.x - origin.x, dy = target.y - origin.y
        const distance = Math.hypot(dx, dy)
        if (distance > weapon.range || distance < 1e-6) continue
        const angle = Math.acos(Math.max(-1, Math.min(1, (dx * heading.x + dy * heading.y) / distance)))
        // Au contact, on touche même un peu de biais : le cône seul raterait un voisin collé en diagonale.
        if (angle > weapon.cone && !(distance < 1.1 && angle < Math.PI / 2)) continue
        if (distance < bestDistance) {
            best = target
            bestDistance = distance
        }
    }
    return best
}

export interface Hit { target: Target; damage: number; health: number; killed: boolean }

export function strike(life: Life, weapon: Weapon, target: Target): Hit | null {
    if (isDead(life, target.id)) return null
    const health = Math.max(0, (life.health.get(target.id) ?? target.maxHealth) - weapon.damage)
    life.health.set(target.id, health)
    if (health > 0) return {target, damage: weapon.damage, health, killed: false}
    life.dead.set(target.id, REVIVE_HOURS)
    life.health.delete(target.id)
    return {target, damage: weapon.damage, health: 0, killed: true}
}

/** Fait passer `hours` heures de jeu ; renvoie les êtres revenus à la vie, en pleine forme. */
export function passTime(life: Life, hours: number): string[] {
    const revived: string[] = []
    for (const [id, left] of life.dead) {
        if (left - hours > 0) {
            life.dead.set(id, left - hours)
            continue
        }
        life.dead.delete(id)
        revived.push(id)
    }
    return revived
}
