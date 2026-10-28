import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { battleApi } from '../battle/api'
import { deferred, initialBattle } from '../test/fixtures'
import { createEncounterOverlay } from './encounterOverlay'
import type { WorldPokemon } from './worldPokemon'
import type { Battle } from '../battle/types'

vi.mock('../battle/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../battle/api')>(),
    battleApi: {create: vi.fn(), get: vi.fn(), playTurn: vi.fn(), playAiTurn: vi.fn()},
}))
vi.mock('../battle/BattlePage', () => ({
    BattleSession: ({battle}: {battle: Battle}) => <p>Combat reçu : {battle.id}</p>,
}))

const charmander: WorldPokemon = {id: 'charmander-01', speciesKey: 'charmander', position: {x: 30, y: 38}}
let overlay: ReturnType<typeof createEncounterOverlay> | null = null
afterEach(() => {
    act(() => overlay?.dispose())
    overlay = null
    document.body.replaceChildren()
    vi.resetAllMocks()
})

function setup() {
    const background = document.createElement('div')
    background.inert = false
    const previousButton = document.createElement('button')
    previousButton.textContent = 'Exploration'
    background.appendChild(previousButton)
    document.body.appendChild(background)
    previousButton.focus()
    const onPause = vi.fn(), onResume = vi.fn()
    overlay = createEncounterOverlay({background: [background], onPause, onResume})
    return {background, previousButton, onPause, onResume}
}

describe('Rencontre depuis le monde 3D', () => {
    it('ouvre un seul panneau, crée le bon duel une seule fois et reprend l’exploration à la fermeture', async () => {
        const {background, previousButton, onPause, onResume} = setup()
        act(() => {
            expect(overlay!.open(charmander)).toBe(true)
            expect(overlay!.open(charmander)).toBe(false)
        })
        expect(screen.getAllByRole('dialog')).toHaveLength(1)
        expect(screen.getByRole('dialog')).toHaveFocus()
        expect(background.inert).toBe(true)
        expect(onPause).toHaveBeenCalledTimes(1)
        expect(battleApi.create).not.toHaveBeenCalled()
        const pending = deferred<Battle>()
        vi.mocked(battleApi.create).mockReturnValue(pending.promise)
        const start = screen.getByRole('button', {name: 'Commencer le combat'})
        fireEvent.click(start)
        fireEvent.click(start)
        expect(battleApi.create).toHaveBeenCalledTimes(1)
        expect(battleApi.create).toHaveBeenCalledWith(
            {first_species: 'pikachu', second_species: 'charmander'}, expect.any(AbortSignal),
        )
        const back = screen.getByRole('button', {name: 'Retour à l’exploration'})
        expect(back).toBeDisabled()
        fireEvent.click(back)
        expect(onResume).not.toHaveBeenCalled()
        await act(async () => pending.resolve(initialBattle))
        expect(screen.getByText(`Combat reçu : ${initialBattle.id}`)).toBeVisible()
        fireEvent.click(back)
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(overlay!.isOpen).toBe(false)
        expect(background.inert).toBe(false)
        expect(onResume).toHaveBeenCalledTimes(1)
        expect(previousButton).toHaveFocus()
    })

    it('affiche une erreur serveur et permet de réessayer puis de revenir au monde', async () => {
        const {onResume} = setup()
        vi.mocked(battleApi.create).mockRejectedValueOnce(new Error('Serveur indisponible'))
            .mockResolvedValueOnce(initialBattle)
        act(() => { overlay!.open(charmander) })
        fireEvent.click(screen.getByRole('button', {name: 'Commencer le combat'}))
        expect(await screen.findByRole('alert')).toHaveTextContent('Serveur indisponible')
        expect(onResume).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', {name: 'Commencer le combat'}))
        await waitFor(() => expect(screen.getByText(`Combat reçu : ${initialBattle.id}`)).toBeVisible())
        fireEvent.click(screen.getByRole('button', {name: 'Retour à l’exploration'}))
        expect(onResume).toHaveBeenCalledTimes(1)
    })

    it('garde le focus clavier dans le panneau', () => {
        setup()
        act(() => { overlay!.open(charmander) })
        const start = screen.getByRole('button', {name: 'Commencer le combat'})
        const back = screen.getByRole('button', {name: 'Retour à l’exploration'})
        back.focus()
        fireEvent.keyDown(back, {key: 'Tab'})
        expect(start).toHaveFocus()
        fireEvent.keyDown(start, {key: 'Tab', shiftKey: true})
        expect(back).toHaveFocus()
    })

    it('renforce le dresseur avec les objets du sac et signale la victoire une seule fois', async () => {
        setup()
        const onVictory = vi.fn()
        const won: Battle = {...initialBattle, is_over: true, winner: initialBattle.first.id}
        vi.mocked(battleApi.create).mockResolvedValue(won)
        act(() => {
            overlay!.open({id: 'mewtwo', speciesKey: 'mewtwo', position: {x: 5, y: 6}}, {
                title: 'Mewtwo !', bonus: {first_level: 55, first_potions: 4, text: 'Grâce à ton sac : niveau 55, 4 potions.'},
                onVictory, victoryText: 'Mewtwo est capturé !',
            })
        })
        expect(screen.getByRole('heading', {name: 'Mewtwo !'})).toBeVisible()
        expect(screen.getByText('Grâce à ton sac : niveau 55, 4 potions.')).toBeVisible()
        fireEvent.click(screen.getByRole('button', {name: 'Commencer le combat'}))
        expect(battleApi.create).toHaveBeenCalledWith(
            {first_species: 'pikachu', second_species: 'mewtwo', first_level: 55, first_potions: 4}, expect.any(AbortSignal),
        )
        expect(await screen.findByText('Mewtwo est capturé !')).toBeVisible()
        expect(onVictory).toHaveBeenCalledTimes(1)
    })
})
