import { useEffect, useRef, useState } from 'react'
import { createAttackAudio } from './attackAudio'
import type { AttackClip } from './attackPlayback'

export function useBattleAudio(active: AttackClip | null) {
  const audio = useRef<ReturnType<typeof createAttackAudio> | null>(null)
  const skipped = useRef<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [volume, setVolume] = useState(0.5)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => () => {audio.current?.dispose(); audio.current = null}, [])
  useEffect(() => {
    const silence = () => {if (document.hidden) audio.current?.stop()}
    document.addEventListener('visibilitychange', silence)
    return () => document.removeEventListener('visibilitychange', silence)
  }, [])
  useEffect(() => {
    if (enabled && active && active.id !== skipped.current && !document.hidden) audio.current?.play(active)
    return () => audio.current?.stop()
  }, [active, enabled])
  useEffect(() => {audio.current?.setVolume(volume)}, [volume])
  async function toggle() {
    if (enabled) {audio.current?.stop(); setEnabled(false); return}
    try {
      // Création/reprise pendant le clic : les navigateurs refusent l'autoplay audio.
      const current = audio.current ?? createAttackAudio(); audio.current = current
      await current.resume()
      if (audio.current !== current) return
      current.setVolume(volume); skipped.current = active?.id ?? null
      setError(null); setEnabled(true)
    } catch {setError('Le son est indisponible dans ce navigateur.'); setEnabled(false)}
  }
  return {enabled, volume, setVolume, toggle, error}
}
