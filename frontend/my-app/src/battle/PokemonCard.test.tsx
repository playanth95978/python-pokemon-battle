import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PokemonCard } from './PokemonCard'
import { initialBattle } from '../test/fixtures'

it('affiche le statut et les crans non nuls reçus du serveur', () => {
  const fighter = {...initialBattle.first, status: 'paralysis' as const,
    stat_stages: {...initialBattle.first.stat_stages, attack: 2, speed: -1}}
  render(<PokemonCard fighter={fighter} side="first" artwork={null} active={null}/>)
  expect(screen.getByText('Paralysé')).toBeInTheDocument()
  expect(screen.getByText('Attaque +2')).toBeInTheDocument()
  expect(screen.getByText('Vitesse -1')).toBeInTheDocument()
  expect(screen.queryByText(/Défense/)).not.toBeInTheDocument()
})
