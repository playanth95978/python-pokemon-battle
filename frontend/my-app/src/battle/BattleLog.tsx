import type { Battle, BattleEvent } from './types'

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
            return `${name(event.winner)} remporte le combat.`
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
