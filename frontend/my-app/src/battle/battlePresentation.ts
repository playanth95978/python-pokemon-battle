import type { Battle, BattleEvent, Fighter, StatStages } from './types'

/** Projection d'affichage dérivée des événements ; aucun second état métier stocké. */
export function battlePresentation(battle: Battle, events: BattleEvent[], revealedCount: number): Battle {
    // Une relecture peut être plus récente que le journal local : ne jamais la rembobiner.
    if (events.at(-1)?.turn !== battle.turn || revealedCount >= events.length) return battle
    const pending = events.slice(revealedCount)

    function fighterPresentation(fighter: Fighter): Fighter {
        let hp = fighter.hp
        let potions = fighter.potions
        let status = fighter.status
        let stages: StatStages = fighter.stat_stages
        const attacks = fighter.attacks.map((attack) => ({...attack}))
        for (const event of [...pending].reverse()) {
            if (event.type === 'potion_used' && event.actor === fighter.id) {
                hp = event.hp_remaining - event.healed
                potions = event.potions_remaining + 1
            }
            if (event.type === 'damage_dealt' && event.target === fighter.id) hp = event.hp_remaining + event.damage
            if (event.type === 'burn_damage' && event.fighter === fighter.id) hp = event.hp_remaining + event.damage
            // Un seul statut à la fois : avant son application, le combattant n'en avait aucun.
            if (event.type === 'status_applied' && event.target === fighter.id) status = null
            if (event.type === 'stat_changed' && event.target === fighter.id) stages = {...stages, [event.stat]: event.stage - event.change}
            if (event.type === 'attack_used' && event.actor === fighter.id) {
                // Les anciens reçus n'ont pas de numéro de attack_slot ; conserver leur lisibilité.
                const attack = attacks.find((item) => event.attack_slot != null ? item.attack_slot === event.attack_slot : item.name === event.attack)
                if (attack) attack.pp = event.pp_remaining + 1
            }
        }
        return {...fighter, hp, potions, attacks, status, stat_stages: stages}
    }

    const ending = pending.some((event) => event.type === 'battle_ended')
    return {
        ...battle, first: fighterPresentation(battle.first), second: fighterPresentation(battle.second),
        winner: ending ? null : battle.winner, is_over: ending ? false : battle.is_over
    }
}
