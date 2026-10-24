import { useMemo, useState } from 'react'
import type { Catalogue, PokemonEntry } from './catalogueTypes'
import type { CatalogueFilters } from './catalogueFilters'
import { defaultFilters, filterCatalogue, formatRelease } from './catalogueFilters'

const PAGE_SIZE = 24

function Thumbnail({pokemon}: { pokemon: PokemonEntry }) {
    const [failed, setFailed] = useState(false)
    return failed ? <span className="catalogue-thumbnail" aria-hidden="true">◉</span>
        : <img className="catalogue-thumbnail"
               src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.pokemon_id}.png`}
               alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}/>
}

export function PokemonCatalogue({catalogue, disabled, onSelect}: {
    catalogue: Catalogue; disabled: boolean; onSelect: (side: 'first' | 'second', key: string) => void
}) {
    const [filters, setFilters] = useState(defaultFilters)
    const [page, setPage] = useState(0)
    const [side, setSide] = useState<'first' | 'second'>('first')
    const results = useMemo(() => filterCatalogue(catalogue, filters), [catalogue, filters])
    const pages = Math.ceil(results.length / PAGE_SIZE)
    const current = Math.min(page, Math.max(0, pages - 1))

    function change<K extends keyof CatalogueFilters>(key: K, value: CatalogueFilters[K]) {
        setFilters((previous) => ({...previous, [key]: value}))
        setPage(0)
    }

    const version = catalogue.versions.find((entry) => entry.id === Number(filters.version))
    return <details className="catalogue card">
        <summary>Catalogue des
            Pokémon <span>{catalogue.species.length} espèces · {catalogue.generations.length} générations</span>
        </summary>
        <p className="muted text-sm mt-3">Espèces et formes par défaut. Dates des jeux et du début des générations, pas
            dates d’apparition individuelles.</p>
        <div className="catalogue-filters">
            <label>Rechercher<input type="search" value={filters.search} placeholder="Nom français, anglais ou numéro"
                                    onChange={(event) => change('search', event.target.value)}/></label>
            <label>Type<select value={filters.type} onChange={(event) => change('type', event.target.value)}>
                <option value="">Tous les types</option>
                {catalogue.types.map((type) => <option key={type.key} value={type.key}>{type.name}</option>)}
            </select></label>
            <label>Catégorie<select value={filters.category}
                                    onChange={(event) => change('category', event.target.value)}>
                <option value="">Toutes les catégories</option>
                <option value="ordinary">Ordinaires</option>
                <option value="legendary">Légendaires</option>
                <option value="mythical">Fabuleux</option>
                <option value="baby">Bébés</option>
            </select></label>
            <label>Génération<select value={filters.generation}
                                     onChange={(event) => change('generation', event.target.value)}>
                <option value="">Toutes les générations</option>
                {catalogue.generations.map((generation) => <option key={generation.id}
                                                                   value={generation.id}>{generation.name} · {formatRelease(generation.release_date)}</option>)}
            </select></label>
            <label>Version / Pokédex<select value={filters.version}
                                            onChange={(event) => change('version', event.target.value)}>
                <option value="">Toutes les versions</option>
                {catalogue.versions.map((entry) => <option key={entry.id}
                                                           value={entry.id}>{entry.name} · {formatRelease(entry.release_date)}</option>)}
            </select></label>
            <label>Trier par<select value={filters.sort} onChange={(event) => change('sort', event.target.value)}>
                <option value="release">Génération : plus anciennes</option>
                <option value="recent">Génération : plus récentes</option>
                <option value="number">Numéro national</option>
                <option value="name">Nom A–Z</option>
            </select></label>
            <label>Choisir pour<select value={side}
                                       onChange={(event) => setSide(event.target.value as 'first' | 'second')}
                                       disabled={disabled}>
                <option value="first">Combattant 1</option>
                <option value="second">Combattant 2</option>
            </select></label>
        </div>
        {version &&
            <p className="muted text-sm mb-3">Sortie du jeu : {formatRelease(version.release_date)}. Présence au Pokédex
                régional, sans distinction des exclusivités ni garantie de capture.</p>}
        <p role="status" className="text-sm mb-3">{results.length} Pokémon trouvés ·
            Page {pages ? current + 1 : 0} / {pages}</p>
        <div className="catalogue-grid">
            {results.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((pokemon) => <button key={pokemon.id}
                                                                                                    type="button"
                                                                                                    className="catalogue-entry"
                                                                                                    disabled={disabled}
                                                                                                    aria-label={`Choisir ${pokemon.name} pour le combattant ${side === 'first' ? 1 : 2}`}
                                                                                                    onClick={() => onSelect(side, pokemon.key)}>
                <Thumbnail
                    pokemon={pokemon}/><span><small>#{String(pokemon.id).padStart(4, '0')}</small><strong>{pokemon.name}</strong>
          <small>{pokemon.types.map((type) => catalogue.types.find((entry) => entry.key === type)?.name ?? type).join(' / ')}</small>
          <small>{pokemon.mythical ? 'Fabuleux' : pokemon.legendary ? 'Légendaire' : pokemon.baby ? 'Bébé' : pokemon.genus}</small>
          <small>Gén. {pokemon.generation} · {formatRelease(catalogue.generations.find((entry) => entry.id === pokemon.generation)?.release_date)}</small>
        </span>
            </button>)}
        </div>
        {!results.length && <p className="muted">Aucun Pokémon ne correspond. Essaie d’autres filtres.</p>}
        <div className="catalogue-pagination">
            <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Précédent</button>
            <button type="button" onClick={() => {
                setFilters(defaultFilters);
                setPage(0)
            }}>Réinitialiser les filtres
            </button>
            <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Suivant</button>
        </div>
        <p className="muted text-xs mt-3">Instantané du {formatRelease(catalogue.updated_at)} · <a
            href={catalogue.source} target="_blank" rel="noreferrer">Données PokéAPI</a></p>
    </details>
}
