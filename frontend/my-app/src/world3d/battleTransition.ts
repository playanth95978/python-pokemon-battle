/** Transition de combat façon manga, jouée par-dessus la scène 3D avant l'ouverture de l'arène. */
import './battleTransition.css'

/** Durée jusqu'au noir complet : l'arène peut s'ouvrir dessous. */
export const TRANSITION_MS = 1750
const LEAVE_MS = 360

/**
 * Joue la transition. La promesse est résolue au noir complet ; `leave()` fait ensuite disparaître le voile,
 * une fois le combat affiché dessous. Avec « réduire les animations », le noir arrive presque aussitôt.
 */
export function playBattleTransition(title: string, subtitle: string) {
    const element = document.createElement('div')
    element.className = 'manga-transition'
    element.setAttribute('role', 'presentation')
    element.innerHTML = `
        <div class="manga-transition__speedlines"></div>
        <div class="manga-transition__panel manga-transition__panel--top"></div>
        <div class="manga-transition__panel manga-transition__panel--bottom"></div>
        <div class="manga-transition__flash"></div>
        <div class="manga-transition__impact">!!</div>
        <div class="manga-transition__title"><strong></strong><small></small></div>
        <div class="manga-transition__curtain"></div>`
    // Textes posés en texte brut : jamais interprétés comme du HTML.
    element.querySelector('strong')!.textContent = title
    element.querySelector('small')!.textContent = subtitle
    document.body.appendChild(element)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const blackout = new Promise<void>((resolve) => setTimeout(resolve, reduced ? 50 : TRANSITION_MS))
    return {
        element,
        blackout,
        leave() {
            element.classList.add('manga-transition--leaving')
            setTimeout(() => element.remove(), LEAVE_MS)
        },
    }
}
