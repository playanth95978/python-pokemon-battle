import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { WorldMap } from '../world/types'
import { VillageMap, type MapLocation, type MapPoint } from './VillageMap'
import './villageMap.css'

interface Options {
    map: WorldMap
    extraPoints: MapPoint[]
    location: () => MapLocation
    canOpen: () => boolean
    onPause: () => void
    onResume: () => void
}

/** La carte est montée seulement à l'ouverture ; aucune boucle de rendu ou requête réseau supplémentaire. */
export function createVillageMap({map, extraPoints, location, canOpen, onPause, onResume}: Options) {
    let root: Root | null = null
    let container: HTMLDivElement | null = null
    let previousFocus: HTMLElement | null = null

    function close() {
        if (!root) return
        root.unmount()
        root = null
        container?.remove()
        container = null
        onResume()
        if (previousFocus?.isConnected) previousFocus.focus()
    }

    function open() {
        if (root || !canOpen()) return false
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
        onPause()
        root.render(createElement(VillageMap, {map, extraPoints, location: location(), onClose: close}))
        return true
    }

    function onKey(event: KeyboardEvent) {
        if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
        if (event.key === 'Escape' && root) { event.preventDefault(); close(); return }
        const target = event.target
        if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return
        if (event.key.toLowerCase() !== 'c') return
        event.preventDefault()
        if (root) close()
        else open()
    }
    window.addEventListener('keydown', onKey)
    return {
        open, close,
        get isOpen() { return root !== null },
        dispose() { window.removeEventListener('keydown', onKey); close() },
    }
}
