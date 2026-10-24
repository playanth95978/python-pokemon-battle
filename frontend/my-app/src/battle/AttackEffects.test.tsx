import { render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AttackEffects } from './AttackEffects'
import type { AttackClip } from './attackPlayback'
import { renderAttack3D } from './renderAttack3D'

vi.mock('./renderAttack3D', () => ({ renderAttack3D: vi.fn() }))
afterEach(() => vi.resetAllMocks())
const clip: AttackClip = { id: '1-0', actor: 'a', target: 'b', name: 'Flammèche', kind: 'fire', outcome: 'hit' }

it('libère la scène 3D au démontage', async () => {
  const dispose = vi.fn()
  vi.mocked(renderAttack3D).mockReturnValue(dispose)
  const { unmount } = render(<AttackEffects clip={clip} fromPlayer />)
  await waitFor(() => expect(renderAttack3D).toHaveBeenCalledTimes(1))
  unmount()
  expect(dispose).toHaveBeenCalledTimes(1)
})

it('garde un effet CSS visible si WebGL est indisponible', async () => {
  vi.mocked(renderAttack3D).mockImplementation(() => { throw new Error('WebGL indisponible') })
  const { container } = render(<AttackEffects clip={clip} fromPlayer />)
  await waitFor(() => expect(renderAttack3D).toHaveBeenCalledTimes(1))
  expect(container.querySelector('.attack-fallback.effect-fire')).toBeInTheDocument()
})
