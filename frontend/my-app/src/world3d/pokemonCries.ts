/** Cris servis par PokéAPI/cries, uniquement pour les espèces présentes dans Clairbois. */
const IDS: Record<string, number> = {pikachu: 25, charmander: 4, machop: 66, mareep: 179, growlithe: 58, eevee: 133, snorlax: 143, pidgey: 16, magikarp: 129, gastly: 92}

export function createPokemonCries(context: AudioContext, fetcher: typeof fetch = fetch) {
    const buffers = new Map<string, AudioBuffer | null>()
    const pending = new Map<string, {controller: AbortController; timeout: ReturnType<typeof setTimeout>}>()
    let disposed = false
    return {
        /** Lance au plus un téléchargement par espèce ; aucun son retardé n'est joué après le retour réseau. */
        get(species: string): AudioBuffer | null {
            if (disposed || !IDS[species]) return null
            if (buffers.has(species)) return buffers.get(species) ?? null
            if (pending.has(species)) return null
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)
            pending.set(species, {controller, timeout})
            void (async () => {
                try {
                    const response = await fetcher(`https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${IDS[species]}.ogg`, {signal: controller.signal})
                    if (!response.ok) throw new Error('Cry unavailable')
                    const buffer = await context.decodeAudioData(await response.arrayBuffer())
                    if (!disposed) buffers.set(species, buffer)
                } catch {
                    // Le moteur utilise son cri synthétique, sans relancer une requête à chaque image.
                    if (!disposed) buffers.set(species, null)
                } finally {
                    clearTimeout(timeout)
                    pending.delete(species)
                }
            })()
            return null
        },
        dispose() { disposed = true; pending.forEach(({controller, timeout}) => { controller.abort(); clearTimeout(timeout) }); pending.clear(); buffers.clear() },
    }
}
