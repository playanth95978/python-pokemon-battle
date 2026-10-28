import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { EncounterBattle } from './EncounterBattle'
import type { EncounterOptions } from './EncounterBattle'
import type { WorldPokemon } from './worldPokemon'
import '../index.css'
import './encounterOverlay.css'

interface Options {
    background: HTMLElement[]
    onPause: () => void
    onResume: () => void
}

/** Pont entre la scène impérative et React ; les requêtes restent dans useBattle. */
export function createEncounterOverlay({background, onPause, onResume}: Options) {
    let root: Root | null = null
    let container: HTMLDivElement | null = null
    let previousFocus: HTMLElement | null = null
    let previousInert: boolean[] = []

    function close() {
        if (!root) return
        root.unmount()
        root = null
        container?.remove()
        container = null
        background.forEach((element, index) => { element.inert = previousInert[index] })
        onResume()
        if (previousFocus?.isConnected) previousFocus.focus()
    }

    return {
        get isOpen() { return root !== null },
        open(opponent: WorldPokemon, options: EncounterOptions = {}): boolean {
            // Le verrou est synchrone : deux pressions sur E ne créent pas deux panneaux.
            if (root) return false
            previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
            previousInert = background.map((element) => element.inert)
            background.forEach((element) => { element.inert = true })
            container = document.createElement('div')
            container.className = 'world-encounter-overlay'
            document.body.appendChild(container)
            root = createRoot(container)
            onPause()
            root.render(createElement(EncounterBattle, {...options, opponent, onClose: close}))
            return true
        },
        dispose: close,
    }
}
