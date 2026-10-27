import { afterEach, describe, expect, it, vi } from 'vitest'
import { playBattleTransition, TRANSITION_MS } from './battleTransition'

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

function prefersReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {configurable: true, value: () => ({matches, addEventListener() {}, removeEventListener() {}})})
}

describe('Transition de combat façon manga', () => {
  it('affiche le titre en texte brut et atteint le noir après la durée prévue', async () => {
    prefersReducedMotion(false)
    vi.useFakeTimers()
    const transition = playBattleTransition('<b>Léviator</b> sauvage !', 'Le Léviathan surgit')
    expect(document.querySelector('.manga-transition strong')!.textContent).toBe('<b>Léviator</b> sauvage !')
    expect(document.querySelector('.manga-transition b')).toBeNull()
    let done = false
    void transition.blackout.then(() => { done = true })
    await vi.advanceTimersByTimeAsync(TRANSITION_MS - 10)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(20)
    expect(done).toBe(true)
  })

  it('passe presque aussitôt au noir quand les animations sont réduites', async () => {
    prefersReducedMotion(true)
    vi.useFakeTimers()
    let done = false
    void playBattleTransition('Léviator sauvage !', 'Le Léviathan surgit').blackout.then(() => { done = true })
    await vi.advanceTimersByTimeAsync(60)
    expect(done).toBe(true)
  })

  it('disparaît après son fondu de sortie', async () => {
    vi.useFakeTimers()
    const transition = playBattleTransition('Léviator sauvage !', 'Le Léviathan surgit')
    transition.leave()
    expect(transition.element.classList).toContain('manga-transition--leaving')
    await vi.advanceTimersByTimeAsync(400)
    expect(document.querySelector('.manga-transition')).toBeNull()
  })
})
