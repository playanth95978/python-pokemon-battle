import { useEffect, useState } from 'react'
import { loadPokemonArtwork } from './pokemonArtwork'
import type { PokemonArtwork } from './pokemonArtwork'

export function usePokemonArtwork(species: string | undefined) {
  const [resource, setResource] = useState<{ species: string; artwork: PokemonArtwork | null } | null>(null)
  useEffect(() => {
    if (!species) return
    let cancelled = false
    // La requête partagée continue pour alimenter le cache, sans mettre à jour un composant démonté.
    void loadPokemonArtwork(species).then(
      (artwork) => { if (!cancelled) setResource({ species, artwork }) },
      () => { if (!cancelled) setResource({ species, artwork: null }) },
    )
    return () => { cancelled = true }
  }, [species])
  return resource && resource.species === species ? resource.artwork : null
}
