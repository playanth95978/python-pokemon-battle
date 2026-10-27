import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STEP_INTERVAL, useWorldMovement } from './useWorldMovement'
import { WORLD_MAP } from './worldMap'

function Harness({ active = true }: { active?: boolean }) {
  const { player, surfaceRef, reset } = useWorldMovement(WORLD_MAP, active)
  return <><div ref={surfaceRef} tabIndex={0} aria-label="Terrain">{player.position.x},{player.position.y}</div>
    <button onClick={reset}>Départ</button></>
}
afterEach(() => vi.useRealTimers())

describe('Déplacements dans le monde', () => {
  it('répète les déplacements maintenus et arrête au relâchement ou à la perte de focus', () => {
    vi.useFakeTimers()
    render(<Harness />)
    const terrain = screen.getByLabelText('Terrain')
    terrain.focus()
    fireEvent.keyDown(terrain, { key: 'ArrowRight' })
    act(() => vi.advanceTimersByTime(STEP_INTERVAL * 2))
    expect(terrain).toHaveTextContent('21,36')
    fireEvent.keyUp(window, { key: 'ArrowRight' })
    act(() => vi.advanceTimersByTime(STEP_INTERVAL * 2))
    expect(terrain).toHaveTextContent('21,36')
    fireEvent.keyDown(terrain, { key: 'z' })
    fireEvent.blur(terrain)
    act(() => vi.advanceTimersByTime(STEP_INTERVAL * 2))
    expect(terrain).toHaveTextContent('21,35')
    fireEvent.click(screen.getByText('Départ'))
    expect(terrain).toHaveTextContent('18,36')
  })

  it('ne capture pas les flèches hors de la carte et suspend le mouvement quand elle est masquée', () => {
    vi.useFakeTimers()
    const { rerender } = render(<Harness />)
    const terrain = screen.getByLabelText('Terrain')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(terrain).toHaveTextContent('18,36')
    fireEvent.keyDown(terrain, { key: 'ArrowRight' })
    rerender(<Harness active={false} />)
    act(() => vi.advanceTimersByTime(STEP_INTERVAL * 10))
    expect(terrain).toHaveTextContent('19,36')
    rerender(<Harness />)
    act(() => vi.advanceTimersByTime(STEP_INTERVAL * 2))
    expect(terrain).toHaveTextContent('19,36')
  })
})
