import type { Battle, BattleEvent, Fighter } from './types'

/** Projection d'affichage dérivée des événements ; aucun second état métier stocké. */
export function battlePresentation(battle: Battle, events: BattleEvent[], revealedCount: number): Battle {
    // Une relecture peut être plus récente que le journal local : ne jamais la rembobiner.
    if (events.at(-1)?.turn !== battle.turn || revealedCount >= events.length) return battle
    const pending = events.slice(revealedCount)

    function fighterPresentation(fighter: Fighter): Fighter {
        let hp = fighter.hp
        let potions = fighter.potions
        const attacks = fighter.attacks.map((attack) => ({...attack}))
        for (const event of [...pending].reverse()) {
            if (event.type === 'potion_used' && event.actor === fighter.id) {
                hp = event.hp_remaining - event.healed
                potions = event.potions_remaining + 1
            }
            if (event.type === 'damage_dealt' && event.target === fighter.id) hp = event.hp_remaining + event.damage
            if (event.type === 'attack_used' && event.actor === fighter.id) {
                // Les anciens reçus n'ont pas de numéro de attack_slot ; conserver leur lisibilité.
                const attack = attacks.find((item) => event.attack_slot != null ? item.attack_slot === event.attack_slot : item.name === event.attack)
                if (attack) attack.pp = event.pp_remaining + 1
            }
        }
        return {...fighter, hp, potions, attacks}
    }

    return {
        ...battle, first: fighterPresentation(battle.first), second: fighterPresentation(battle.second),
        winner: pending.some((event) => event.type === 'battle_ended') ? null : battle.winner
    }
}
