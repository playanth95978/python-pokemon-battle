import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RefObject } from 'react'
import App from './App'

vi.mock('./world/WorldCanvas', () => ({
  WorldCanvas: ({ surfaceRef, onInteract }: { surfaceRef: RefObject<HTMLDivElement>; onInteract: () => void }) =>
    <div ref={surfaceRef} tabIndex={0} aria-label="Carte" onKeyDown={(event) => { if (event.key === 'e') onInteract() }} />,
}))
vi.mock('./battle/BattlePage', () => ({ BattlePage: () => <h1>Arène de test</h1> }))

describe('Accès au monde et aux combats', () => {
  it('permet de marcher, lire un panneau et retrouver sa position après un passage dans l’arène', () => {
    render(<App />)
    expect(screen.getByText('Case 18, 36')).toBeVisible()
    fireEvent.keyDown(screen.getByLabelText('Carte'), { key: 'e' })
    expect(screen.getByRole('status')).toHaveTextContent('Bienvenue à Clairbois')
    fireEvent.click(screen.getByRole('button', { name: 'Aller vers la droite' }))
    expect(screen.getByText('Case 19, 36')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Arène', exact: true }))
    expect(screen.getByRole('heading', { name: 'Arène de test' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Explorer', exact: true }))
    expect(screen.getByText('Case 19, 36')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Revenir au départ' }))
    expect(screen.getByText('Case 18, 36')).toBeVisible()
  })
})
