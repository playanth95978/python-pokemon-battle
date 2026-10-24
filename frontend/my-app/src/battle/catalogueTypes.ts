export interface PokemonEntry {
    id: number
    pokemon_id: number
    key: string
    name: string
    genus: string
    generation: number
    types: string[]
    legendary: boolean
    mythical: boolean
    baby: boolean
    versions: number[]
    fallback_attack: boolean
}

export interface GenerationEntry {
    id: number;
    name: string;
    release_date: string
}

export interface VersionEntry {
    id: number;
    key: string;
    name: string;
    generation: number;
    release_date: string | null;
    order: number
}

export interface Catalogue {
    source: string
    updated_at: string
    species: PokemonEntry[]
    generations: GenerationEntry[]
    versions: VersionEntry[]
    types: { key: string; name: string }[]
}
