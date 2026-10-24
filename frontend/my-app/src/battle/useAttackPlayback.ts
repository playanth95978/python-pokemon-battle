import { useEffect, useMemo, useState } from 'react'
import { ATTACK_DURATION, attackClips } from './attackPlayback'
import type { BattleEvent } from './types'

export function useAttackPlayback(events: BattleEvent[], enabled: boolean) {
  const clips = useMemo(() => attackClips(events), [events])
  const [{cursor, impact}, setPlayback] = useState({cursor: 0, impact: false})
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    const change = () => setReducedMotion(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const active = enabled && !reducedMotion ? clips[cursor] ?? null : null
  useEffect(() => {
    if (cursor >= clips.length) return
    const hit = window.setTimeout(() => setPlayback({cursor, impact: true}), ATTACK_DURATION * 0.65)
    const timer = window.setTimeout(() => setPlayback({cursor: enabled && !reducedMotion ? cursor + 1 : clips.length, impact: false}),
      enabled && !reducedMotion ? ATTACK_DURATION : 0)
    return () => { window.clearTimeout(hit); window.clearTimeout(timer) }
  }, [cursor, clips.length, enabled, reducedMotion])
  let revealedCount = events.length
  if (active) {
    const start = events.findIndex((event, index) => event.type === 'attack_used' && `${event.turn}-${index}` === active.id)
    const next = events.findIndex((event, index) => index > start && (event.type === 'attack_used' || event.type === 'battle_ended'))
    revealedCount = impact ? next < 0 ? events.length : next : start + 1
  }
  return { active, isPlaying: active !== null, reducedMotion, revealedCount }
}
