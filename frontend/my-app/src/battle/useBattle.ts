import { useEffect, useRef, useState } from 'react'
import { ApiError, battleApi } from './api'
import type { ActionChoices, AiTurnCommand, Battle, BattleAction, BattleChoices, BattleEvent, MoveChoices, TurnCommand } from './types'

type Pending = 'create' | 'turn' | 'refresh' | null

interface Session {
    battle: Battle;
    events: BattleEvent[]
}

export function useBattle() {
    // Une seule copie de la réponse serveur ; aucun PV, PP ou vainqueur calculé localement.
    const [session, setSession] = useState<Session | null>(null)
    const [pending, setPending] = useState<Pending>(null)
    const [error, setError] = useState<string | null>(null)
    const [needsSync, setNeedsSync] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const [canRetry, setCanRetry] = useState(false)
    const uncertainTurn = useRef<{ battleId: string; command: TurnCommand | AiTurnCommand } | null>(null)
    const inFlight = useRef<AbortController | null>(null)
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false;
            inFlight.current?.abort()
        }
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
            if (kind === 'turn') {
                setNeedsSync(true)
                setCanRetry(uncertainTurn.current !== null && (!(cause instanceof ApiError) || cause.status >= 500
                    || (cause.status === 409 && ('player_move' in uncertainTurn.current.command || 'player_action' in uncertainTurn.current.command))))
            }
        } finally {
            inFlight.current = null
            if (mounted.current) setPending(null)
        }
    }

    async function createBattle(choices: BattleChoices) {
        await run('create', async (signal) => {
            const battle = await battleApi.create(choices, signal)
            if (!mounted.current) return
            setSession({battle, events: []})
            setNeedsSync(false)
            setNotice(null)
            setCanRetry(false)
            uncertainTurn.current = null
        })
    }

    async function playTurn(moves: MoveChoices | ActionChoices) {
        if (!session || session.battle.winner !== null || needsSync) return
        await run('turn', async (signal) => {
            const command = {...moves, expected_turn: session.battle.turn, idempotency_key: crypto.randomUUID()}
            uncertainTurn.current = {battleId: session.battle.id, command}
            await executeTurn(session.battle.id, command, signal, false)
        })
    }

    async function playAiTurn(playerMove: number | BattleAction) {
        if (!session || session.battle.winner !== null || needsSync) return
        await run('turn', async (signal) => {
            const action = typeof playerMove === 'number' ? {player_move: playerMove} : {player_action: playerMove}
            const command = {...action, expected_turn: session.battle.turn, idempotency_key: crypto.randomUUID()}
            uncertainTurn.current = {battleId: session.battle.id, command}
            await executeTurn(session.battle.id, command, signal, false)
        })
    }

    async function executeTurn(battleId: string, command: TurnCommand | AiTurnCommand, signal: AbortSignal, retry: boolean) {
        const result = 'player_move' in command || 'player_action' in command
            ? await battleApi.playAiTurn(battleId, command, signal)
            : await battleApi.playTurn(battleId, command, signal)
        // Une réponse idempotente peut être ancienne : relire l'état courant après une reprise.
        const battle = retry ? await battleApi.get(battleId, signal) : result.battle
        if (!mounted.current) return
        setSession((previous) => ({
            battle, events: previous?.events.some((event) => event.turn === result.battle.turn)
                ? previous.events : [...(previous?.events ?? []), ...result.events]
        }))
        uncertainTurn.current = null
        setCanRetry(false)
        setNeedsSync(false)
        setNotice(retry ? 'Résultat récupéré sans rejouer un tour déjà enregistré. État courant relu.'
            : result.decision ? `${result.decision.source === 'llm' ? 'Mistral' : 'Stratégie locale de secours'} : ${result.decision.comment || 'Attaque sélectionnée.'}` : null)
    }

    async function retryLastTurn() {
        const request = uncertainTurn.current
        if (!request || !canRetry) return
        await run('turn', (signal) => executeTurn(request.battleId, request.command, signal, true))
    }

    async function refresh() {
        if (!session) return
        await run('refresh', async (signal) => {
            const battle = await battleApi.get(session.battle.id, signal)
            if (!mounted.current) return
            setSession((previous) => ({battle, events: previous?.events ?? []}))
            setNeedsSync(false)
            setCanRetry(false)
            uncertainTurn.current = null
            setNotice('État relu sur le serveur. Les événements d’un tour dont la réponse a été perdue ne peuvent pas être récupérés.')
        })
    }

    return {
        battle: session?.battle ?? null, events: session?.events ?? [],
        pending, error, notice, needsSync, canRetry, createBattle, playTurn, playAiTurn, retryLastTurn, refresh
    }
}
