import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { battleApi } from './api'
import { useBattle } from './useBattle'
import { deferred, initialBattle, resolvedTurn } from '../test/fixtures'
import type { TurnResponse } from './types'

vi.mock('./api', () => ({ battleApi: { create: vi.fn(), get: vi.fn(), playTurn: vi.fn() } }))
afterEach(() => vi.resetAllMocks())
const choices = { first_species: 'bulbizarre', second_species: 'salameche' }
const moves = { first_move: 0, second_move: 1 }

describe('useBattle', () => {
  it('ne crée pas de combat automatiquement sous StrictMode', () => {
    renderHook(() => useBattle(), { wrapper: StrictMode })
    expect(battleApi.create).not.toHaveBeenCalled()
  })

  it('bloque les créations simultanées avant même un rendu', async () => {
    const request = deferred<typeof initialBattle>()
    vi.mocked(battleApi.create).mockReturnValue(request.promise)
    const { result } = renderHook(() => useBattle())
    act(() => { void result.current.createBattle(choices); void result.current.createBattle(choices) })
    expect(battleApi.create).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe('create')
    await act(async () => request.resolve(initialBattle))
    expect(result.current.battle).toEqual(initialBattle)
  })

  it('attend le serveur, bloque les doubles tours et conserve sa réponse exacte', async () => {
    vi.mocked(battleApi.create).mockResolvedValue(initialBattle)
    const request = deferred<TurnResponse>()
    vi.mocked(battleApi.playTurn).mockReturnValue(request.promise)
    const { result } = renderHook(() => useBattle())
    await act(async () => result.current.createBattle(choices))
    act(() => { void result.current.playTurn(moves); void result.current.playTurn(moves) })
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
    const { result } = renderHook(() => useBattle())
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
    const { result } = renderHook(() => useBattle())
    await act(async () => result.current.createBattle(choices))
    await act(async () => result.current.playTurn(moves))
    vi.mocked(battleApi.create).mockRejectedValueOnce(new Error('Indisponible'))
    await act(async () => result.current.createBattle(choices))
    expect(result.current.battle).toEqual(resolvedTurn.battle)
    expect(result.current.events).toEqual(resolvedTurn.events)
    vi.mocked(battleApi.create).mockResolvedValueOnce({ ...initialBattle, id: 'battle-2' })
    await act(async () => result.current.createBattle(choices))
    expect(result.current.battle?.id).toBe('battle-2')
    expect(result.current.events).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('refuse un tour après la victoire et annule une requête au démontage', async () => {
    vi.mocked(battleApi.create).mockResolvedValue({ ...initialBattle, winner: 'first' })
    const { result, unmount } = renderHook(() => useBattle())
    await act(async () => result.current.createBattle(choices))
    await act(async () => result.current.playTurn(moves))
    expect(battleApi.playTurn).not.toHaveBeenCalled()
    const request = deferred<typeof initialBattle>()
    vi.mocked(battleApi.create).mockReturnValue(request.promise)
    act(() => { void result.current.createBattle(choices) })
    const signal = vi.mocked(battleApi.create).mock.calls.at(-1)![1]
    unmount()
    expect(signal.aborted).toBe(true)
    request.resolve(initialBattle)
    await waitFor(() => expect(battleApi.create).toHaveBeenCalledTimes(2))
  })
})
