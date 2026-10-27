import type { BattleStat, StatusCondition } from './types'

export const statusLabels: Record<StatusCondition, string> = {paralysis: 'Paralysé', burn: 'Brûlé'}

export const statLabels: Record<BattleStat, string> = {
  attack: 'Attaque', defense: 'Défense', special_attack: 'Atq. spé.', special_defense: 'Déf. spé.', speed: 'Vitesse',
}

/** Cran affiché avec son signe : +2, -1. */
export function signedStage(stage: number): string {
  return stage > 0 ? `+${stage}` : `${stage}`
}
