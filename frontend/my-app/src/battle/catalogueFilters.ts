import type { Catalogue, PokemonEntry } from './catalogueTypes'

export interface CatalogueFilters {
    search: string;
    type: string;
    category: string;
    generation: string;
    version: string;
    sort: string
}

export const defaultFilters: CatalogueFilters = {
    search: '',
    type: '',
    category: '',
    generation: '',
    version: '',
    sort: 'release'
}
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function filterCatalogue(catalogue: Catalogue, filters: CatalogueFilters): PokemonEntry[] {
    const search = normalize(filters.search.trim().replace(/^#/, ''))
    const number = /^\d+$/.test(search) ? Number(search) : null
    const dates = new Map(catalogue.generations.map((generation) => [generation.id, generation.release_date]))
    return catalogue.species.filter((pokemon) => {
        const category = filters.category === 'legendary' ? pokemon.legendary
            : filters.category === 'mythical' ? pokemon.mythical
                : filters.category === 'baby' ? pokemon.baby
                    : filters.category === 'ordinary' ? !pokemon.legendary && !pokemon.mythical && !pokemon.baby : true
        return category && (!filters.type || pokemon.types.includes(filters.type))
            && (!filters.generation || pokemon.generation === Number(filters.generation))
            && (!filters.version || pokemon.versions.includes(Number(filters.version)))
            && (!search || (number !== null ? pokemon.id === number : normalize(`${pokemon.name} ${pokemon.key} ${pokemon.genus}`).includes(search)))
    }).sort((a, b) => {
        if (filters.sort === 'name') return a.name.localeCompare(b.name, 'fr')
        if (filters.sort === 'number') return a.id - b.id
        const order = (dates.get(a.generation) ?? '').localeCompare(dates.get(b.generation) ?? '') || a.id - b.id
        return filters.sort === 'recent' ? -order : order
    })
}

export function formatRelease(value: string | null | undefined): string {
    return value ? new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${value}T00:00:00Z`)) : 'Date non renseignée'
}
