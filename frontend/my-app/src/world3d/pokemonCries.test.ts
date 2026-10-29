import { describe, expect, it, vi } from 'vitest'
import { createPokemonCries } from './pokemonCries'

describe('Cache des cris Pokémon', () => {
    it('charge une seule fois une espèce demandée et réutilise le son décodé', async () => {
        const buffer = {} as AudioBuffer
        const context = {decodeAudioData: vi.fn().mockResolvedValue(buffer)} as unknown as AudioContext
        const fetcher = vi.fn().mockResolvedValue({ok: true, arrayBuffer: async () => new ArrayBuffer(4)})
        const cries = createPokemonCries(context, fetcher)
        expect(fetcher).not.toHaveBeenCalled()
        expect(cries.get('pikachu')).toBeNull()
        cries.get('pikachu')
        expect(fetcher).toHaveBeenCalledOnce()
        expect(fetcher.mock.calls[0][0]).toBe('https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/25.ogg')
        await vi.waitFor(() => expect(cries.get('pikachu')).toBe(buffer))
        expect(context.decodeAudioData).toHaveBeenCalledOnce()
        cries.dispose()
    })

    it('laisse le repli synthétique prendre le relais après un échec sans répéter le téléchargement', async () => {
        const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'))
        const cries = createPokemonCries({} as AudioContext, fetcher)
        cries.get('eevee')
        await Promise.resolve(); await Promise.resolve()
        expect(cries.get('eevee')).toBeNull()
        expect(cries.get('unknown')).toBeNull()
        expect(fetcher).toHaveBeenCalledOnce()
        cries.dispose()
    })

    it('annule les requêtes en cours à la fermeture et refuse toute nouvelle demande', () => {
        const fetcher = vi.fn().mockReturnValue(new Promise(() => {}))
        const cries = createPokemonCries({} as AudioContext, fetcher)
        cries.get('mareep')
        const signal = fetcher.mock.calls[0][1].signal as AbortSignal
        cries.dispose()
        expect(signal.aborted).toBe(true)
        expect(cries.get('pikachu')).toBeNull()
        expect(fetcher).toHaveBeenCalledOnce()
    })
})
