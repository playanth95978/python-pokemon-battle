import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { PokemonCatalogue } from './PokemonCatalogue'
import { defaultFilters, filterCatalogue, formatRelease } from './catalogueFilters'
import type { Catalogue, PokemonEntry } from './catalogueTypes'

const pokemon = (id: number, overrides: Partial<PokemonEntry> = {}): PokemonEntry => ({
  id, pokemon_id: id, key: `pokemon-${id}`, name: `Pokémon ${id}`, genus: 'Pokémon Démonstration', generation: 1,
  types: ['electric'], legendary: false, mythical: false, baby: false, versions: [1], fallback_attack: false, ...overrides,
})
const catalogue: Catalogue = {
  source: 'https://github.com/PokeAPI/pokeapi', updated_at: '2026-10-24',
  generations: [{ id: 1, name: 'Génération I', release_date: '1996-02-27' }, { id: 9, name: 'Génération IX', release_date: '2022-11-18' }],
  versions: [{ id: 1, key: 'red', name: 'Rouge', generation: 1, release_date: '1996-02-27', order: 1 }],
  types: [{ key: 'electric', name: 'Électrik' }, { key: 'psychic', name: 'Psy' }],
  species: [pokemon(25, { name: 'Pikachu', key: 'pikachu' }),
    pokemon(150, { name: 'Mewtwo', key: 'mewtwo', types: ['psychic'], legendary: true }),
    pokemon(1025, { name: 'Pêchaminus', key: 'pecharunt', mythical: true, generation: 9, versions: [] })],
}

it('combine les filtres, y compris les noms accentués et numéros', () => {
  expect(filterCatalogue(catalogue, { ...defaultFilters, search: 'pechaminus' }).map((entry) => entry.id)).toEqual([1025])
  expect(filterCatalogue(catalogue, { ...defaultFilters, search: '#25' }).map((entry) => entry.id)).toEqual([25])
  expect(filterCatalogue(catalogue, { ...defaultFilters, type: 'psychic', category: 'legendary', generation: '1', version: '1' }).map((entry) => entry.id)).toEqual([150])
  expect(filterCatalogue(catalogue, { ...defaultFilters, type: 'electric', category: 'legendary' })).toEqual([])
  expect(filterCatalogue(catalogue, { ...defaultFilters, sort: 'recent' }).map((entry) => entry.id)).toEqual([1025, 150, 25])
  expect(formatRelease('1996-02-27')).toBe('27 févr. 1996')
})

it('sélectionne un Pokémon pour le combattant choisi sans appel HTTP', () => {
  const onSelect = vi.fn()
  render(<PokemonCatalogue catalogue={catalogue} disabled={false} onSelect={onSelect} />)
  fireEvent.click(screen.getByText('Catalogue des Pokémon'))
  fireEvent.change(screen.getByLabelText('Choisir pour'), { target: { value: 'second' } })
  fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'legendary' } })
  fireEvent.click(screen.getByRole('button', { name: 'Choisir Mewtwo pour le combattant 2' }))
  expect(onSelect).toHaveBeenCalledWith('second', 'mewtwo')
  expect(screen.queryByRole('button', { name: /Choisir Pikachu/ })).not.toBeInTheDocument()
})

it('pagine sans tronquer le catalogue et revient à la première page après filtrage', () => {
  render(<PokemonCatalogue catalogue={{ ...catalogue, species: Array.from({ length: 30 }, (_, index) => pokemon(index + 1)) }} disabled={false} onSelect={vi.fn()} />)
  fireEvent.click(screen.getByText('Catalogue des Pokémon'))
  expect(screen.getAllByRole('button', { name: /^Choisir Pokémon/ })).toHaveLength(24)
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
  expect(screen.getAllByRole('button', { name: /^Choisir Pokémon/ })).toHaveLength(6)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '#1' } })
  expect(screen.getAllByRole('button', { name: /^Choisir Pokémon/ })).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled()
})
