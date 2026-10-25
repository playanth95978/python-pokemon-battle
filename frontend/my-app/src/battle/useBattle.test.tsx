import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, battleApi } from './api'
import { useBattle } from './useBattle'
import { deferred, initialBattle, resolvedTurn } from '../test/fixtures'
import type { TurnResponse } from './types'

vi.mock('./api', async (importOriginal) => ({
    ...await importOriginal<typeof import('./api')>(),
    battleApi: {create: vi.fn(), get: vi.fn(), playTurn: vi.fn(), playAiTurn: vi.fn()},
}))
afterEach(() => vi.resetAllMocks())
const choices = {first_species: 'bulbizarre', second_species: 'salameche'}
const moves = {first_move: 0, second_move: 1}

describe('useBattle', () => {
    it.each([false, true])('réessaie une potion avec la même commande et la même clé, mode IA=%s', async (ai) => {
        vi.mocked(battleApi.create).mockResolvedValue(initialBattle)
        const api = ai ? battleApi.playAiTurn : battleApi.playTurn
        vi.mocked(api).mockRejectedValueOnce(new Error('Réponse perdue')).mockResolvedValue(resolvedTurn)
        vi.mocked(battleApi.get).mockResolvedValue(resolvedTurn.battle)
        const {result} = renderHook(() => useBattle())
        await act(async () => result.current.createBattle(choices))
        await act(async () => {
            if (ai) await result.current.playAiTurn({action_type: 'potion'})
            else await result.current.playTurn({first_action: {action_type: 'potion'}, second_action: {action_type: 'attack', attack_slot: 0}})
        })
        const command = vi.mocked(api).mock.calls[0][1]
        expect(result.current.canRetry).toBe(true)
        await act(async () => result.current.retryLastTurn())
        expect(vi.mocked(api).mock.calls[1][1]).toEqual(command)
        expect(api).toHaveBeenCalledTimes(2)
        expect(result.current.needsSync).toBe(false)
    })

    it('envoie seulement le choix humain en mode IA et bloque les doubles clics', async () => {
        vi.mocked(battleApi.create).mockResolvedValue(initialBattle)
        const pending = deferred<TurnResponse>()
        vi.mocked(battleApi.playAiTurn).mockReturnValue(pending.promise)
        const {result} = renderHook(() => useBattle())
        await act(async () => result.current.createBattle(choices))
        act(() => {
            void result.current.playAiTurn(0)
            void result.current.playAiTurn(0)
        })
        expect(battleApi.playAiTurn).toHaveBeenCalledTimes(1)
        expect(battleApi.playTurn).not.toHaveBeenCalled()
        expect(battleApi.playAiTurn).toHaveBeenCalledWith(initialBattle.id,
            {player_move: 0, expected_turn: initialBattle.turn, idempotency_key: expect.any(String)}, expect.any(AbortSignal))
        expect(result.current.battle).toEqual(initialBattle)
        await act(async () => pending.resolve({...resolvedTurn, decision: {action_type: 'attack', attack_slot: 1, source: 'local', comment: '', fallback_reason: 'timeout'}}))
        expect(result.current.battle).toEqual(resolvedTurn.battle)
        expect(result.current.notice).toContain('Stratégie locale de secours')
    })

    it('reprend un tour IA avec la même clé et la même route après perte de réponse', async () => {
        vi.mocked(battleApi.create).mockResolvedValue(initialBattle)
        vi.mocked(battleApi.playAiTurn).mockRejectedValueOnce(new Error('Réponse perdue')).mockResolvedValue(resolvedTurn)
        vi.mocked(battleApi.get).mockResolvedValue(resolvedTurn.battle)
        const {result} = renderHook(() => useBattle())
        await act(async () => result.current.createBattle(choices))
        await act(async () => result.current.playAiTurn(0))
        const command = vi.mocked(battleApi.playAiTurn).mock.calls[0][1]
        expect(result.current.canRetry).toBe(true)
        await act(async () => result.current.retryLastTurn())
        expect(vi.mocked(battleApi.playAiTurn).mock.calls[1][1]).toEqual(command)
        expect(battleApi.playTurn).not.toHaveBeenCalled()
        expect(result.current.events).toEqual(resolvedTurn.events)
    })

    it('ne crée pas de combat automatiquement sous StrictMode', () => {
        renderHook(() => useBattle(), {wrapper: StrictMode})
        expect(battleApi.create).not.toHaveBeenCalled()
    })

    it('bloque les créations simultanées avant même un rendu', async () => {
        const request = deferred<typeof initialBattle>()
        vi.mocked(battleApi.create).mockReturnValue(request.promise)
        const {result} = renderHook(() => useBattle())
        act(() => {
            void result.current.createBattle(choices);
            void result.current.createBattle(choices)
        })
        expect(battleApi.create).toHaveBeenCalledTimes(1)
        expect(result.current.pending).toBe('create')
        await act(async () => request.resolve(initialBattle))
        expect(result.current.battle).toEqual(initialBattle)
    })

    it('attend le serveur, bloque les doubles tours et conserve sa réponse exacte', async () => {
        vi.mocked(battleApi.create).mockResolvedValue(initialBattle)
        const request = deferred<TurnResponse>()
        vi.mocked(battleApi.playTurn).mockReturnValue(request.promise)
        const {result} = renderHook(() => useBattle())
        await act(async () => result.current.createBattle(choices))
        act(() => {
            void result.current.playTurn(moves);
            void result.current.playTurn(moves)
        })
        expect(battleApi.playTurn).toHaveBeenCalledTimes(1)
        expect(result.current.battle).toEqual(initialBattle)
        expect(result.current.events).toEqual([])
        await act(async () => request.resolve(resolvedTurn))
        expect(result.current.battle).toEqual(resolvedTurn.battle)
        expect(result.current.events).toEqual(resolvedTurn.events)
    })

    it('bloque les attaques après une erreur jusqu’à une relecture réussie', async () => {
        vi.mocked(battleApi.create).mockResolvedValue(initialBattle)
        vi.mocked(battleApi.playTurn).mockRejectedValue(new Error('Réponse perdue'))
        const {result} = renderHook(() => useBattle())
        await act(async () => result.current.createBattle(choices))
        await act(async () => result.current.playTurn(moves))
        expect(result.current.needsSync).toBe(true)
        expect(result.current.battle).toEqual(initialBattle)
        await act(async () => result.current.playTurn(moves))
        expect(battleApi.playTurn).toHaveBeenCalledTimes(1)
        vi.mocked(battleApi.get).mockRejectedValueOnce(new Error('Toujours hors ligne'))
        await act(async () => result.current.refresh())
        expect(result.current.needsSync).toBe(true)
        vi.mocked(battleApi.get).mockResolvedValue(resolvedTurn.battle)
        await act(async () => result.current.refresh())
        expect(result.current.needsSync).toBe(false)
        expect(result.current.battle).toEqual(resolvedTurn.battle)
        expect(result.current.events).toEqual([])
        expect(result.current.notice).toContain('ne peuvent pas être récupérés')
    })

    it('conserve le combat si le redémarrage échoue et réinitialise le journal après succès', async () => {
        vi.mocked(battleApi.create).mockResolvedValueOnce(initialBattle)
        vi.mocked(battleApi.playTurn).mockResolvedValue(resolvedTurn)
        const {result} = renderHook(() => useBattle())
        await act(async () => result.current.createBattle(choices))
        await act(async () => result.current.playTurn(moves))
        vi.mocked(battleApi.create).mockRejectedValueOnce(new Error('Indisponible'))
        await act(async () => result.current.createBattle(choices))
        expect(result.current.battle).toEqual(resolvedTurn.battle)
        expect(result.current.events).toEqual(resolvedTurn.events)
        vi.mocked(battleApi.create).mockResolvedValueOnce({...initialBattle, id: 'battle-2'})
        await act(async () => result.current.createBattle(choices))
        expect(result.current.battle?.id).toBe('battle-2')
        expect(result.current.events).toEqual([])
        expect(result.current.error).toBeNull()
    })

    it('refuse un tour après la victoire et annule une requête au démontage', async () => {
        vi.mocked(battleApi.create).mockResolvedValue({...initialBattle, winner: 'first'})
        const {result, unmount} = renderHook(() => useBattle())
        await act(async () => result.current.createBattle(choices))
        await act(async () => result.current.playTurn(moves))
        expect(battleApi.playTurn).not.toHaveBeenCalled()
        const request = deferred<typeof initialBattle>()
        vi.mocked(battleApi.create).mockReturnValue(request.promise)
        act(() => {
            void result.current.createBattle(choices)
        })
        const signal = vi.mocked(battleApi.create).mock.calls.at(-1)![1]
        unmount()
        expect(signal.aborted).toBe(true)
        request.resolve(initialBattle)
        await waitFor(() => expect(battleApi.create).toHaveBeenCalledTimes(2))
    })

    it('réutilise la clé et le contenu après une réponse perdue, puis relit l’état courant', async () => {
        vi.mocked(battleApi.create).mockResolvedValue(initialBattle)
        vi.mocked(battleApi.playTurn).mockRejectedValueOnce(new Error('Réponse perdue'))
            .mockResolvedValue(resolvedTurn)
        vi.mocked(battleApi.get).mockRejectedValueOnce(new Error('Lecture perdue'))
            .mockResolvedValue({...resolvedTurn.battle, turn: 2})
        const {result} = renderHook(() => useBattle())
        await act(async () => result.current.createBattle(choices))
        await act(async () => result.current.playTurn(moves))
        expect(result.current.canRetry).toBe(true)
        const command = vi.mocked(battleApi.playTurn).mock.calls[0][1]
        expect(command).toEqual({...moves, expected_turn: 0, idempotency_key: expect.any(String)})
        await act(async () => result.current.retryLastTurn())
        expect(result.current.canRetry).toBe(true)
        expect(result.current.events).toEqual([])
        await act(async () => result.current.retryLastTurn())
        expect(vi.mocked(battleApi.playTurn).mock.calls.map((call) => call[1])).toEqual([command, command, command])
        expect(result.current.battle?.turn).toBe(2)
        expect(result.current.events).toEqual(resolvedTurn.events)
        expect(result.current.canRetry).toBe(false)
        expect(result.current.needsSync).toBe(false)
        await act(async () => result.current.retryLastTurn())
        expect(battleApi.playTurn).toHaveBeenCalledTimes(3)
        await act(async () => result.current.playTurn(moves))
        const next = vi.mocked(battleApi.playTurn).mock.calls[3][1]
        expect(next.expected_turn).toBe(2)
        expect(next.idempotency_key).not.toBe(command.idempotency_key)
    })

    it('exige une relecture après un conflit sans proposer de rejouer le même contenu', async () => {
        vi.mocked(battleApi.create).mockResolvedValue(initialBattle)
        vi.mocked(battleApi.playTurn).mockRejectedValue(new ApiError('Le combat a évolué', 409))
        const {result} = renderHook(() => useBattle())
        await act(async () => result.current.createBattle(choices))
        await act(async () => result.current.playTurn(moves))
        expect(result.current.error).toBe('Le combat a évolué')
        expect(result.current.needsSync).toBe(true)
        expect(result.current.canRetry).toBe(false)
        await act(async () => result.current.retryLastTurn())
        expect(battleApi.playTurn).toHaveBeenCalledTimes(1)
    })
})
