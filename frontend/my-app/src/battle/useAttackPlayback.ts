import { useEffect, useMemo, useState } from 'react'
import { ATTACK_DURATION, attackClips } from './attackPlayback'
import type { BattleEvent } from './types'

export function useAttackPlayback(events: BattleEvent[], enabled: boolean) {
  const clips = useMemo(() => attackClips(events), [events])
  const [cursor, setCursor] = useState(0)
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
    const timer = window.setTimeout(() => setCursor((value) => enabled && !reducedMotion ? value + 1 : clips.length),
      enabled && !reducedMotion ? ATTACK_DURATION : 0)
    return () => window.clearTimeout(timer)
  }, [cursor, clips.length, enabled, reducedMotion])
  return { active, isPlaying: active !== null, reducedMotion }
}
