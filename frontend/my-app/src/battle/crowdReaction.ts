import type { Battle } from './types'
import type { AttackClip } from './attackPlayback'

export type CrowdReaction = 'watching' | 'anticipation' | 'cheer' | 'miss' | 'immune' | 'knockout' | 'victory'

/** Le public suit la présentation des événements ; il n'anticipe aucun résultat. */
export function crowdReaction(battle: Battle, active: AttackClip | null, impact: boolean): CrowdReaction {
  if (battle.winner !== null) return 'victory'
  if (!active) return 'watching'
  if (!impact) return 'anticipation'
  if (active.outcome === 'miss') return 'miss'
  if (active.outcome === 'immune') return 'immune'
  const target = [battle.first, battle.second].find((fighter) => fighter.id === active.target)
  return target?.hp === 0 ? 'knockout' : 'cheer'
}

export const crowdMessages: Record<CrowdReaction, string> = {
  watching: 'Le public suit le combat.', anticipation: 'Le public retient son souffle.',
  cheer: 'Le public applaudit l’attaque !', miss: 'L’attaque manque sa cible : déception dans les gradins.',
  immune: 'Aucun effet : le public est surpris.', knockout: 'K.O. ! Le public se lève !',
  victory: 'Le public acclame le vainqueur !',
}
