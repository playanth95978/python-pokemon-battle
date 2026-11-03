import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/dom'
import { createArrestOverlay } from './arrestOverlay'

const prototype = HTMLDialogElement.prototype
const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
beforeAll(() => {
    Object.defineProperty(prototype, 'showModal', {configurable: true, value(this: HTMLDialogElement) { this.open = true }})
    Object.defineProperty(prototype, 'close', {configurable: true, value(this: HTMLDialogElement) { this.open = false }})
})
afterAll(() => {
    if (originalShow) Object.defineProperty(prototype, 'showModal', originalShow)
    else Reflect.deleteProperty(prototype, 'showModal')
    if (originalClose) Object.defineProperty(prototype, 'close', originalClose)
    else Reflect.deleteProperty(prototype, 'close')
})
let overlay: ReturnType<typeof createArrestOverlay> | undefined
afterEach(() => {overlay?.dispose(); overlay = undefined; document.body.replaceChildren()})

describe('Présentation de l’interpellation', () => {
    it('annonce la capture et attend le clic sans retour automatique ni activation par Espace relâché', () => {
        const canvas = document.createElement('button')
        document.body.appendChild(canvas); canvas.focus()
        const onPause = vi.fn(), onRelease = vi.fn()
        const onResist = vi.fn()
        overlay = createArrestOverlay({onPause, onRelease, onResist})
        expect(overlay.open()).toBe(true)
        expect(overlay.open()).toBe(false)
        expect(onPause).toHaveBeenCalledOnce()
        const dialog = screen.getByRole('dialog', {name: 'Interpellé par la garde montée'})
        const title = screen.getByRole('heading', {name: 'Interpellé par la garde montée'})
        expect(title).toHaveFocus()
        fireEvent.keyUp(title, {key: ' ', code: 'Space'})
        expect(onRelease).not.toHaveBeenCalled()
        expect(fireEvent(dialog, new Event('cancel', {cancelable: true}))).toBe(false)
        expect(overlay.isOpen).toBe(true)
        const button = screen.getByRole('button', {name: 'Se rendre · aller en prison'})
        fireEvent.click(button)
        fireEvent.click(button)
        expect(onRelease).toHaveBeenCalledOnce()
        expect(onResist).not.toHaveBeenCalled()
        expect(overlay.isOpen).toBe(false)
        expect(canvas).toHaveFocus()
    })

    it('ferme les ressources à la sortie de page sans déclencher de retour au bourg', () => {
        const onRelease = vi.fn()
        overlay = createArrestOverlay({onPause: vi.fn(), onRelease, onResist: vi.fn()})
        overlay.open()
        overlay.dispose()
        expect(onRelease).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('permet de résister sans déclencher le transfert en prison', () => {
        const onRelease = vi.fn(), onResist = vi.fn()
        overlay = createArrestOverlay({onPause: vi.fn(), onRelease, onResist})
        overlay.open()
        fireEvent.click(screen.getByRole('button', {name: 'Se défendre · duel'}))
        expect(onResist).toHaveBeenCalledOnce()
        expect(onRelease).not.toHaveBeenCalled()
        expect(overlay.isOpen).toBe(false)
    })
})
