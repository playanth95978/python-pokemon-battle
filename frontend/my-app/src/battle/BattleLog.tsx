import type { Battle, BattleEvent, BattleStat, EffectFailure, StatusCondition } from './types'
import { signedStage } from './statusLabels'

const appliedStatus: Record<StatusCondition, string> = {paralysis: 'est paralysé', burn: 'est brûlé'}
const statWithArticle: Record<BattleStat, string> = {
    attack: 'L’attaque', defense: 'La défense', special_attack: 'L’attaque spéciale',
    special_defense: 'La défense spéciale', speed: 'La vitesse',
}

function stageChange(change: number): string {
    if (change >= 2) return 'augmente fortement'
    if (change > 0) return 'augmente'
    if (change <= -2) return 'baisse fortement'
    return 'baisse'
}

function failure(reason: EffectFailure, actor: string, target: string): string {
    switch (reason) {
        case 'already_has_status':
            return `${target} a déjà un statut : sans effet.`
        case 'immune':
            return `${target} n’est pas affecté.`
        case 'stat_limit':
            return `Les statistiques de ${target} ne peuvent plus aller plus loin.`
        case 'consecutive_protection':
            return `${actor} ne peut pas se protéger deux tours de suite.`
    }
}

function describe(event: BattleEvent, battle: Battle): string {
    const name = (id: string) => id === battle.first.id
        ? `${battle.first.species} (1)` : id === battle.second.id ? `${battle.second.species} (2)` : id
    switch (event.type) {
        case 'potion_used':
            return `${name(event.actor)} utilise une potion et récupère ${event.healed} PV (${event.potions_remaining} potions restantes).`
        case 'attack_used':
            return `${name(event.actor)} utilise ${event.attack}. Il reste ${event.pp_remaining} PP.`
        case 'attack_missed':
            return `${name(event.actor)} manque son attaque.`
        case 'damage_dealt': {
            const effect = event.effectiveness === 0 ? ' Aucun effet.'
                : event.effectiveness > 1 ? ' Super efficace !'
                    : event.effectiveness < 1 ? ' Peu efficace.' : ''
            return `${name(event.target)} perd ${event.damage} PV (${event.hp_remaining} restants).${effect}`
        }
        case 'knocked_out':
            return `${name(event.fighter)} est K.O.`
        case 'battle_ended':
            if (event.winner === null) return 'Match nul : les deux combattants sont K.O.'
            return `${name(event.winner)} remporte le combat.`
        case 'fully_paralyzed':
            return `${name(event.actor)} est paralysé et ne peut pas agir.`
        case 'attack_blocked':
            return `${name(event.target)} bloque l’attaque.`
        case 'status_applied':
            return `${name(event.target)} ${appliedStatus[event.condition]}.`
        case 'stat_changed':
            return `${statWithArticle[event.stat]} de ${name(event.target)} ${stageChange(event.change)} (cran ${signedStage(event.stage)}).`
        case 'protection_activated':
            return `${name(event.actor)} se protège.`
        case 'effect_failed':
            return failure(event.reason, name(event.actor), name(event.target))
        case 'burn_damage':
            return `${name(event.fighter)} souffre de sa brûlure et perd ${event.damage} PV (${event.hp_remaining} restants).`
    }
}

export function BattleLog({events, battle}: { events: BattleEvent[]; battle: Battle }) {
    return (
        <section aria-labelledby="battle-log-heading" className="card">
            <h2 id="battle-log-heading">Journal du combat</h2>
            {events.length === 0 ?
                <p className="muted text-sm">Choisis les actions pour jouer le premier tour.</p> : (
                    <ol aria-live="polite" aria-relevant="additions"
                        className="log">
                        {events.map((event, index) => (
                            <li key={`${event.turn}-${index}`}>
                                <span
                                    className="log-turn">Tour {event.turn}</span>{describe(event, battle)}
                            </li>
                        ))}
                    </ol>
                )}
        </section>
    )
}
