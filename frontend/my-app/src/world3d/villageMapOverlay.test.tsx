import { act } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { WORLD_MAP } from '../world/worldMap'
import { createVillageMap } from './villageMapOverlay'

const prototype = HTMLDialogElement.prototype
const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
beforeAll(() => {
    // jsdom ne crée pas la couche modale native ; le navigateur gère réellement son focus et l'arrière-plan inerte.
    Object.defineProperty(prototype, 'showModal', {configurable: true, value(this: HTMLDialogElement) {
        this.open = true
        this.querySelector('button')?.focus()
    }})
    Object.defineProperty(prototype, 'close', {configurable: true, value(this: HTMLDialogElement) { this.open = false }})
})
afterAll(() => {
    if (originalShow) Object.defineProperty(prototype, 'showModal', originalShow)
    else Reflect.deleteProperty(prototype, 'showModal')
    if (originalClose) Object.defineProperty(prototype, 'close', originalClose)
    else Reflect.deleteProperty(prototype, 'close')
})

let overlay: ReturnType<typeof createVillageMap> | undefined
afterEach(() => { act(() => overlay?.dispose()); overlay = undefined; document.body.replaceChildren() })

function setup(allowed = true) {
    const focus = document.createElement('button')
    focus.textContent = 'Afficher la carte'
    document.body.appendChild(focus)
    focus.focus()
    const onPause = vi.fn(), onResume = vi.fn()
    const location = {position: {x: 128, y: 34}, direction: 'right' as const, insideCastle: false}
    overlay = createVillageMap({map: WORLD_MAP, extraPoints: [{id: 'salameche', name: 'Salamèche sauvage',
        description: 'Un duel dans la prairie.', category: 'rencontre', x: 30, y: 38}],
        location: () => location, canOpen: () => allowed, onPause, onResume})
    return {onPause, onResume, focus, location}
}

describe('Carte de Clairbois', () => {
    it('ouvre avec C, affiche le joueur et les lieux, puis reprend le jeu et restaure le focus', () => {
        const {onPause, onResume, focus} = setup()
        act(() => { fireEvent.keyDown(window, {key: 'c'}) })
        expect(overlay!.isOpen).toBe(true)
        expect(onPause).toHaveBeenCalledOnce()
        expect(screen.getByRole('dialog', {name: 'Carte de Clairbois'})).toBeVisible()
        expect(screen.getByRole('img', {name: 'Carte de Clairbois, position du joueur en 128, 34'})).toBeVisible()
        for (const name of ['Château hanté', 'Bateau', 'Salamèche sauvage', 'Quartier des artisans', 'Sortie vers le monde ouvert']) {
            expect(screen.getByRole('button', {name: `Repérer ${name}`})).toBeInTheDocument()
        }
        act(() => { fireEvent.keyDown(window, {key: 'c', repeat: true}) })
        expect(overlay!.isOpen).toBe(true)
        act(() => { fireEvent.keyDown(window, {key: 'C'}) })
        expect(overlay!.isOpen).toBe(false)
        expect(onResume).toHaveBeenCalledOnce()
        expect(focus).toHaveFocus()
    })

    it('recherche sans accents et laisse saisir C sans fermer la carte', () => {
        setup()
        act(() => { overlay!.open() })
        const search = screen.getByRole('searchbox', {name: 'Rechercher un lieu'})
        act(() => { fireEvent.keyDown(search, {key: 'c'}); fireEvent.change(search, {target: {value: 'salameche'}}) })
        expect(overlay!.isOpen).toBe(true)
        expect(screen.getByRole('button', {name: 'Repérer Salamèche sauvage'})).toBeVisible()
        expect(screen.queryByRole('button', {name: 'Repérer Château hanté'})).not.toBeInTheDocument()
        act(() => { fireEvent.keyDown(search, {key: 'Escape'}) })
        expect(overlay!.isOpen).toBe(false)
    })

    it('sélectionne un lieu depuis la liste ou au clavier sur le plan', () => {
        setup()
        act(() => { overlay!.open() })
        const places = screen.getByRole('complementary', {name: 'Points d’intérêt'})
        act(() => { fireEvent.click(within(places).getByRole('button', {name: /^Château hanté/})) })
        expect(screen.getByRole('status')).toHaveTextContent('Case 22, 50.')
        const marker = screen.getByRole('button', {name: 'Repérer Bateau'})
        act(() => { fireEvent.keyDown(marker, {key: 'Enter'}) })
        expect(marker).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('status')).toHaveTextContent('Case 41, 38.')
        act(() => { fireEvent.click(screen.getByRole('button', {name: /Fermer la carte/})) })
        expect(overlay!.isOpen).toBe(false)
    })

    it('refuse de superposer la carte à un combat et ignore les raccourcis modifiés', () => {
        const {onPause} = setup(false)
        act(() => { expect(overlay!.open()).toBe(false); fireEvent.keyDown(window, {key: 'c'}) })
        expect(onPause).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        overlay!.dispose()
        setup()
        act(() => { fireEvent.keyDown(window, {key: 'c', ctrlKey: true}) })
        expect(overlay!.isOpen).toBe(false)
    })

    it('actualise la position à chaque ouverture sans dupliquer la fenêtre ni les tracés de terrain', () => {
        const {onPause, location} = setup()
        act(() => { overlay!.open(); expect(overlay!.open()).toBe(false) })
        expect(screen.getAllByRole('dialog')).toHaveLength(1)
        expect(onPause).toHaveBeenCalledOnce()
        const svg = screen.getByRole('img', {name: /Carte de Clairbois, position/})
        expect(svg.querySelectorAll(':scope > path').length).toBeLessThanOrEqual(6)
        act(() => { overlay!.close() })
        location.position = {x: 18, y: 88}
        location.insideCastle = true
        act(() => { overlay!.open() })
        expect(screen.getByText(/Tu es dans le château/)).toBeVisible()
        expect(screen.getByRole('img', {name: 'Carte de Clairbois, position du joueur en 22, 50'})).toBeVisible()
    })
})
