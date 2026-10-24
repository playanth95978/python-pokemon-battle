/** Ressources d'illustration uniquement : aucune statistique de combat de PokéAPI. */
export interface PokemonArtwork { primary: string; fallback: string | null }
const ids: Record<string, number> = { bulbizarre: 1, salameche: 4, carapuce: 7 }
const cache = new Map<number, Promise<PokemonArtwork>>()

export function loadPokemonArtwork(species: string): Promise<PokemonArtwork> {
  const key = species.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const id = ids[key]
  if (!id) return Promise.reject(new Error('Illustration indisponible pour cette espèce'))
  const existing = cache.get(id)
  if (existing) return existing
  const pending = (async () => {
    const storageKey = `pokemon-artwork-v1-${id}`
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as PokemonArtwork | null
      if (saved && typeof saved.primary === 'string' && saved.primary.startsWith('https://')) return saved
    } catch { /* Le stockage peut être désactivé ; le cache mémoire reste disponible. */ }
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}/`, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error('PokéAPI ne répond pas')
    const data = await response.json() as { sprites?: {
      front_default?: string | null
      other?: { 'official-artwork'?: { front_default?: string | null } }
    } }
    const primary = data.sprites?.other?.['official-artwork']?.front_default ?? data.sprites?.front_default
    if (!primary) throw new Error('Illustration absente de PokéAPI')
    const artwork = { primary, fallback: data.sprites?.front_default ?? null }
    try { sessionStorage.setItem(storageKey, JSON.stringify(artwork)) } catch { /* Cache mémoire seul. */ }
    return artwork
  })()
  cache.set(id, pending)
  void pending.catch(() => cache.delete(id))
  return pending
}
