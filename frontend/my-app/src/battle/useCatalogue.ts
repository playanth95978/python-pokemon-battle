import { useEffect, useState } from 'react'
import { battleApi } from './api'
import type { Catalogue } from './catalogueTypes'
import { registerArtworkEntries } from './pokemonArtwork'

export function useCatalogue() {
    const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [attempt, setAttempt] = useState(0)
    useEffect(() => {
        const controller = new AbortController()
        void battleApi.catalogue(controller.signal).then((data) => {
            if (controller.signal.aborted) return
            registerArtworkEntries(data.species)
            setCatalogue(data)
            setLoading(false)
            setError(null)
        }).catch(() => {
            if (controller.signal.aborted) return
            setError('Le catalogue complet est indisponible. Vérifie que FastAPI a été relancé, puis réessaie. Les Pokémon de démonstration restent disponibles.')
            setLoading(false)
        })
        return () => controller.abort()
    }, [attempt])
    const retry = () => {
        setError(null);
        setLoading(true);
        setAttempt((value) => value + 1)
    }
    return {catalogue, error, loading, retry}
}
