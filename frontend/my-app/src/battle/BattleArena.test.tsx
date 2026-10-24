import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { BattleArena } from './BattleArena'
import { initialBattle } from '../test/fixtures'

vi.mock('./BattleScene3D', () => ({ BattleScene3D: ({ motion, onFailure }: {motion: boolean; onFailure: () => void}) =>
  <div data-testid="scene" data-motion={String(motion)}><button onClick={onFailure}>Simuler une panne WebGL</button></div> }))

const battle = { ...initialBattle, first: { ...initialBattle.first, species: 'Pikachu', hp: 43 } }
const props = { battle, firstArtwork: null, secondArtwork: null, active: null }

it('affiche les modèles disponibles avec les PV exacts du serveur et permet de basculer en 2D', () => {
  render(<BattleArena {...props} motion={false}/> )
  expect(screen.getByTestId('scene')).toHaveAttribute('data-motion', 'false')
  expect(screen.getByRole('progressbar', { name: 'PV de Pikachu, combattant 1' })).toHaveAttribute('aria-valuenow', '43')
  fireEvent.click(screen.getByRole('button', { name: 'Voir en 2D' }))
  expect(screen.queryByTestId('scene')).not.toBeInTheDocument()
  expect(screen.getByRole('img', {name: 'Pikachu, illustration indisponible'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', {name: 'Voir en 3D'}))
  expect(screen.getByTestId('scene')).toBeInTheDocument()
})

it('se replie sur les illustrations après une panne 3D sans modifier les PV', () => {
  render(<BattleArena {...props}/> )
  fireEvent.click(screen.getByText('Simuler une panne WebGL'))
  expect(screen.getByRole('status')).toHaveTextContent('La 3D est indisponible')
  expect(screen.queryByTestId('scene')).not.toBeInTheDocument()
  expect(screen.getByRole('progressbar', {name: 'PV de Pikachu, combattant 1'})).toHaveAttribute('aria-valuenow', '43')
})

it('conserve les illustrations pour une espèce sans modèle local', () => {
  render(<BattleArena {...props} battle={initialBattle}/> )
  expect(screen.queryByTestId('scene')).not.toBeInTheDocument()
  expect(screen.getByRole('img', {name: 'Bulbizarre, illustration indisponible'})).toBeInTheDocument()
})
