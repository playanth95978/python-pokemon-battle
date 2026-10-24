import type { BattleEvent } from './types'

export const ATTACK_DURATION = 1150
export type EffectKind = 'fire' | 'water' | 'vine' | 'charge' | 'electric'
export interface AttackClip {
  id: string
  actor: string
  target: string
  name: string
  kind: EffectKind
  outcome: 'hit' | 'miss' | 'immune'
}

export function effectKind(type?: string | null): EffectKind {
  switch (type) {
    case 'fire': return 'fire'
    case 'water': return 'water'
    case 'grass': return 'vine'
    case 'electric': return 'electric'
    default: return 'charge'
  }
}

export function attackClips(events: BattleEvent[]): AttackClip[] {
  return events.flatMap((event, index) => {
    if (event.type !== 'attack_used') return []
    // Associer le résultat de l'attaque, sans inventer de réussite ou de riposte.
    const nextAttack = events.findIndex((item, i) => i > index && item.type === 'attack_used')
    const following = events.slice(index + 1, nextAttack < 0 ? undefined : nextAttack)
    const missed = following.some((item) => item.type === 'attack_missed' && item.actor === event.actor)
    const damage = following.find((item) => item.type === 'damage_dealt' && item.actor === event.actor)
    if (!missed && !damage) return []
    return [{ id: `${event.turn}-${index}`, actor: event.actor, target: event.target,
      name: event.attack, kind: effectKind(event.attack_type),
      outcome: missed ? 'miss' : damage?.type === 'damage_dealt' && damage.effectiveness === 0 ? 'immune' : 'hit' }]
  })
}
