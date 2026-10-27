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
  it('embarque avec E, conserve le mode après l’arène et débarque avec le bouton', () => {
    render(<App />)
    function walk(label: string, steps: number) {
      for (let index = 0; index < steps; index++) fireEvent.click(screen.getByRole('button', { name: label }))
    }
    walk('Aller vers le haut', 2)
    walk('Aller vers la droite', 23)
    walk('Aller vers le bas', 4)
    expect(screen.getByRole('button', { name: 'Embarquer' })).toBeVisible()
    fireEvent.keyDown(screen.getByLabelText('Carte'), { key: 'e' })
    expect(screen.getByText('Case 42, 38')).toBeVisible()
    expect(screen.getByText('En bateau')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /^Arène$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Explorer$/ }))
    expect(screen.getByText('En bateau')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Débarquer' }))
    expect(screen.getByText('Case 41, 38')).toBeVisible()
    expect(screen.queryByText('En bateau')).not.toBeInTheDocument()
  })

  it('ouvre la vue 3D du monde dans sa propre page', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Vue 3D' })).toHaveAttribute('href', '/world3d.html')
  })

  it('permet de marcher, lire un panneau et retrouver sa position après un passage dans l’arène', () => {
    render(<App />)
    expect(screen.getByText('Case 18, 36')).toBeVisible()
    fireEvent.keyDown(screen.getByLabelText('Carte'), { key: 'e' })
    expect(screen.getByRole('status')).toHaveTextContent('Bienvenue à Clairbois')
    fireEvent.click(screen.getByRole('button', { name: 'Aller vers la droite' }))
    expect(screen.getByText('Case 19, 36')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /^Arène$/ }))
    expect(screen.getByRole('heading', { name: 'Arène de test' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /^Explorer$/ }))
    expect(screen.getByText('Case 19, 36')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Revenir au départ' }))
    expect(screen.getByText('Case 18, 36')).toBeVisible()
  })
})
