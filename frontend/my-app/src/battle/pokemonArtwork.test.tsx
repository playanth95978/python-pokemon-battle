import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PokemonCard } from './PokemonCard'
import { initialBattle } from '../test/fixtures'

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear() })

it('récupère les illustrations PokéAPI et partage le cache entre deux combattants', async () => {
  vi.resetModules()
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sprites: {
    front_default: 'https://example.com/sprite.png',
    other: { 'official-artwork': { front_default: 'https://example.com/artwork.png' } },
  } })))
  vi.stubGlobal('fetch', fetchMock)
  const { loadPokemonArtwork } = await import('./pokemonArtwork')
  const [first, second] = await Promise.all([loadPokemonArtwork('Salamèche'), loadPokemonArtwork('salameche')])
  expect(first).toEqual({ primary: 'https://example.com/artwork.png', fallback: 'https://example.com/sprite.png' })
  expect(second).toEqual(first)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toBe('https://pokeapi.co/api/v2/pokemon/4/')
  // Le cache de session survit aussi à un rechargement du module.
  vi.resetModules()
  await (await import('./pokemonArtwork')).loadPokemonArtwork('Salamèche')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('réessaie après une panne et utilise le sprite si l’illustration officielle manque', async () => {
  vi.resetModules()
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error('Hors ligne')).mockResolvedValueOnce(new Response(JSON.stringify({
    sprites: { front_default: 'https://example.com/sprite.png' },
  })))
  vi.stubGlobal('fetch', fetchMock)
  const { loadPokemonArtwork } = await import('./pokemonArtwork')
  await expect(loadPokemonArtwork('Carapuce')).rejects.toThrow('Hors ligne')
  await expect(loadPokemonArtwork('Carapuce')).resolves.toEqual({ primary: 'https://example.com/sprite.png', fallback: 'https://example.com/sprite.png' })
})

it('ne montre pas d’image cassée et laisse les PV serveur visibles si les deux images échouent', () => {
  render(<PokemonCard fighter={initialBattle.first} side="first" active={null}
    artwork={{ primary: 'https://example.com/artwork.png', fallback: 'https://example.com/sprite.png' }} />)
  fireEvent.error(screen.getByRole('img', { name: 'Bulbizarre' }))
  expect(screen.getByRole('img', { name: 'Bulbizarre' })).toHaveAttribute('src', 'https://example.com/sprite.png')
  fireEvent.error(screen.getByRole('img', { name: 'Bulbizarre' }))
  expect(screen.getByRole('img', { name: 'Bulbizarre, illustration indisponible' })).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '120')
})
