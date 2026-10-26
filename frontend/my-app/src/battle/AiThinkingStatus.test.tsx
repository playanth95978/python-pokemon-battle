import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AiThinkingStatus } from './AiThinkingStatus'

afterEach(() => vi.useRealTimers())

it('affiche l’action envoyée et compte les secondes d’attente', () => {
    vi.useFakeTimers()
    render(<AiThinkingStatus species="Bulbizarre" action="Charge" opponent="Salamèche"/>)
    expect(screen.getByRole('status')).toHaveTextContent('Bulbizarre : Charge')
    expect(screen.getByText(/Mistral réfléchit pour Salamèche/)).toBeInTheDocument()
    expect(screen.getByText('0 s')).toBeInTheDocument()
    act(() => {vi.advanceTimersByTime(3000)})
    expect(screen.getByText('3 s')).toBeInTheDocument()
})
