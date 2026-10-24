import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BattleScene3D } from './BattleScene3D'
import { createBattleScene3D } from './createBattleScene3D'
import { deferred, initialBattle } from '../test/fixtures'
import type { BattleSceneController } from './createBattleScene3D'

vi.mock('./createBattleScene3D', () => ({ createBattleScene3D: vi.fn() }))
afterEach(() => vi.resetAllMocks())
const controller = (): BattleSceneController => ({ update: vi.fn(), rotate: vi.fn(), resetCamera: vi.fn(), dispose: vi.fn() })

it('utilise la dernière réponse serveur après le chargement puis libère la scène au démontage', async () => {
  const loading = deferred<BattleSceneController>()
  vi.mocked(createBattleScene3D).mockReturnValue(loading.promise)
  const failure = vi.fn(), scene = controller()
  const props = {battle: initialBattle, active: null, motion: true, onFailure: failure}
  const view = render(<BattleScene3D {...props}/> )
  await waitFor(() => expect(createBattleScene3D).toHaveBeenCalledOnce())
  const updated = {...initialBattle, turn: 3, first: {...initialBattle.first, hp: 17}}
  view.rerender(<BattleScene3D {...props} battle={updated} motion={false}/> )
  await act(async () => loading.resolve(scene))
  expect(scene.update).toHaveBeenLastCalledWith(updated, null, false)
  expect(screen.getByRole('button', {name: 'Recentrer'})).toBeEnabled()
  view.unmount()
  expect(scene.dispose).toHaveBeenCalledOnce()
  expect(failure).not.toHaveBeenCalled()
})

it('libère une scène qui termine son chargement après un redémarrage du combat', async () => {
  const loading = deferred<BattleSceneController>()
  vi.mocked(createBattleScene3D).mockReturnValue(loading.promise)
  const scene = controller()
  const view = render(<BattleScene3D battle={initialBattle} active={null} motion onFailure={vi.fn()}/> )
  await waitFor(() => expect(createBattleScene3D).toHaveBeenCalledOnce())
  view.unmount()
  await act(async () => loading.resolve(scene))
  expect(scene.dispose).toHaveBeenCalledOnce()
  expect(scene.update).not.toHaveBeenCalled()
})

it('signale une erreur de chargement pour permettre le repli sur les images', async () => {
  vi.mocked(createBattleScene3D).mockRejectedValue(new Error('GLB absent'))
  const failure = vi.fn()
  render(<BattleScene3D battle={initialBattle} active={null} motion onFailure={failure}/> )
  await waitFor(() => expect(failure).toHaveBeenCalledOnce())
})
