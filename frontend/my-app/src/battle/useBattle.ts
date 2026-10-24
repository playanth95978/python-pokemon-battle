import { useEffect, useRef, useState } from 'react'
import { battleApi } from './api'
import type { Battle, BattleChoices, BattleEvent, MoveChoices } from './types'

type Pending = 'create' | 'turn' | 'refresh' | null
interface Session { battle: Battle; events: BattleEvent[] }

export function useBattle() {
  // Une seule copie de la réponse serveur ; aucun PV, PP ou vainqueur calculé localement.
  const [session, setSession] = useState<Session | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsSync, setNeedsSync] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; inFlight.current?.abort() }
  }, [])

  async function run(kind: Exclude<Pending, null>, operation: (signal: AbortSignal) => Promise<void>) {
    // Bloque aussi deux clics avant le prochain rendu React.
    if (inFlight.current) return
    const controller = new AbortController()
    inFlight.current = controller
    setPending(kind)
    setError(null)
    try {
      await operation(controller.signal)
    } catch (cause) {
      if (!mounted.current) return
      setError(cause instanceof Error ? cause.message : 'Une erreur inattendue est survenue.')
      if (kind === 'turn') setNeedsSync(true)
    } finally {
      inFlight.current = null
      if (mounted.current) setPending(null)
    }
  }

  async function createBattle(choices: BattleChoices) {
    await run('create', async (signal) => {
      const battle = await battleApi.create(choices, signal)
      if (!mounted.current) return
      setSession({ battle, events: [] })
      setNeedsSync(false)
      setNotice(null)
    })
  }

  async function playTurn(moves: MoveChoices) {
    if (!session || session.battle.winner !== null || needsSync) return
    await run('turn', async (signal) => {
      const result = await battleApi.playTurn(session.battle.id, moves, signal)
      if (!mounted.current) return
      setSession((previous) => ({ battle: result.battle, events: [...(previous?.events ?? []), ...result.events] }))
    })
  }

  async function refresh() {
    if (!session) return
    await run('refresh', async (signal) => {
      const battle = await battleApi.get(session.battle.id, signal)
      if (!mounted.current) return
      setSession((previous) => ({ battle, events: previous?.events ?? [] }))
      setNeedsSync(false)
      setNotice('État relu sur le serveur. Les événements d’un tour dont la réponse a été perdue ne peuvent pas être récupérés.')
    })
  }

  return { battle: session?.battle ?? null, events: session?.events ?? [],
    pending, error, notice, needsSync, createBattle, playTurn, refresh }
}
