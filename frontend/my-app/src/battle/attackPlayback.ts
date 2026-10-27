import type { BattleEvent } from './types'

export const ATTACK_DURATION = 1150
export type EffectKind = 'fire' | 'water' | 'vine' | 'charge' | 'electric'
export type AttackOutcome = 'hit' | 'miss' | 'immune' | 'blocked' | 'status'
export interface AttackClip {
  id: string
  actor: string
  target: string
  name: string
  kind: EffectKind
  outcome: AttackOutcome
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
    // Une attaque sur soi-même (Abri, Danse Lames) n'a pas de trajectoire à animer.
    if (event.type !== 'attack_used' || event.actor === event.target) return []
    // Associer le résultat de l'attaque, sans inventer de réussite ou de riposte.
    const nextAttack = events.findIndex((item, i) => i > index && item.type === 'attack_used')
    const following = events.slice(index + 1, nextAttack < 0 ? undefined : nextAttack)
    const outcome = attackOutcome(following, event.actor)
    if (!outcome) return []
    return [{ id: `${event.turn}-${index}`, actor: event.actor, target: event.target,
      name: event.attack, kind: effectKind(event.attack_type), outcome }]
  })
}

function attackOutcome(following: BattleEvent[], actor: string): AttackOutcome | null {
  const own = following.filter((item) => 'actor' in item && item.actor === actor)
  if (own.some((item) => item.type === 'attack_blocked')) return 'blocked'
  if (own.some((item) => item.type === 'attack_missed')) return 'miss'
  const damage = own.find((item) => item.type === 'damage_dealt')
  if (damage?.type === 'damage_dealt') return damage.effectiveness === 0 ? 'immune' : 'hit'
  if (own.some((item) => item.type === 'status_applied' || item.type === 'stat_changed')) return 'status'
  if (own.some((item) => item.type === 'effect_failed')) return 'immune'
  return null
}
