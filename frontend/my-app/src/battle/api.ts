import type { Battle, BattleChoices, MoveChoices, TurnResponse } from './types'

async function request<T>(path: string, signal: AbortSignal, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    })
  } catch {
    throw new Error('Le serveur ne répond pas. Vérifie que FastAPI est démarré, puis réessaie.')
  }
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null)
    if (error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string') {
      throw new Error(error.detail)
    }
    throw new Error(response.status === 422
      ? 'La demande est invalide. Vérifie les Pokémon et les attaques sélectionnés.'
      : `La demande a échoué (HTTP ${response.status}).`)
  }
  return response.json() as Promise<T>
}

export const battleApi = {
  create: (choices: BattleChoices, signal: AbortSignal) => request<Battle>('/battles', signal, choices),
  get: (id: string, signal: AbortSignal) => request<Battle>(`/battles/${encodeURIComponent(id)}`, signal),
  playTurn: (id: string, moves: MoveChoices, signal: AbortSignal) =>
    request<TurnResponse>(`/battles/${encodeURIComponent(id)}/turns`, signal, moves),
}
