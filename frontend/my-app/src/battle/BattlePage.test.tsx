import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BattlePage } from './BattlePage'
import { initialBattle, resolvedTurn } from '../test/fixtures'

// Les images externes ont leurs propres tests ; ce parcours simule seulement FastAPI.
vi.mock('./pokemonArtwork', () => ({ loadPokemonArtwork: vi.fn().mockResolvedValue({
  primary: 'https://example.com/pokemon.png', fallback: null,
}) }))

afterEach(() => vi.unstubAllGlobals())
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status})

it('crée, joue jusqu’au KO puis redémarre avec les valeurs du serveur', async () => {
    const finished = {
        battle: {
            ...resolvedTurn.battle, turn: 2, winner: 'second',
            first: {...resolvedTurn.battle.first, hp: 0}
        }, events: [
            {type: 'knocked_out', turn: 2, fighter: 'first'},
            {type: 'battle_ended', turn: 2, winner: 'second'},
        ]
    }
    const fetchMock = vi.fn()
        .mockResolvedValueOnce(json(initialBattle, 201))
        .mockResolvedValueOnce(json(resolvedTurn))
        .mockResolvedValueOnce(json(finished))
        .mockResolvedValueOnce(json({...initialBattle, id: 'new-battle'}, 201))
    vi.stubGlobal('fetch', fetchMock)
    render(<BattlePage/>)
    expect(screen.getByText('L’arène t’attend')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name: 'Créer le combat'}))
    const play = await screen.findByRole('button', {name: 'Jouer le tour'})
    expect(play).toBeDisabled()
    fireEvent.click(within(screen.getByRole('group', {name: 'Attaque 1 : Bulbizarre'})).getAllByRole('radio')[0])
    fireEvent.click(within(screen.getByRole('group', {name: 'Attaque 2 : Salamèche'})).getAllByRole('radio')[0])
    fireEvent.click(play)
    expect(await screen.findByText('Tour 1', {selector: 'p'})).toBeInTheDocument()
    expect(screen.getByRole('progressbar', {name: 'PV de Bulbizarre, combattant 1'})).toHaveAttribute('aria-valuenow', '66')
    expect(screen.getByText(/Salamèche \(2\) utilise Charge/)).toBeInTheDocument()
    expect(screen.getByText(/Bulbizarre \(1\) manque son attaque/)).toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        first_move: 0, second_move: 0, expected_turn: 0, idempotency_key: expect.any(String),
    })
    fireEvent.click(screen.getByRole('button', {name: 'Jouer le tour'}))
    expect(await screen.findByText('Combat terminé')).toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Jouer le tour'})).not.toBeInTheDocument()
    expect(screen.getByText(/remporte le combat/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name: 'Nouveau combat'}))
    await waitFor(() => expect(screen.getByText('Tour 0', {selector: 'p'})).toBeInTheDocument())
    expect(screen.queryByText(/remporte le combat/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Jouer le tour'})).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(4)
})

it('affiche une erreur réseau et permet de relancer la création', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))
    render(<BattlePage/>)
    fireEvent.click(screen.getByRole('button', {name: 'Créer le combat'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Le serveur ne répond pas')
    expect(screen.getByRole('button', {name: 'Créer le combat'})).toBeEnabled()
})

it('désactive les attaques dont les PP sont épuisés', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
        ...initialBattle,
        first: {...initialBattle.first, attacks: initialBattle.first.attacks.map((attack) => ({...attack, pp: 0}))},
    })))
    render(<BattlePage/>)
    fireEvent.click(screen.getByRole('button', {name: 'Créer le combat'}))
    const group = await screen.findByRole('group', {name: 'Attaque 1 : Bulbizarre'})
    expect(within(group).getAllByRole('radio').every((input) => input.hasAttribute('disabled'))).toBe(true)
    expect(screen.getByRole('button', {name: 'Jouer le tour'})).toBeDisabled()
})

it('récupère un tour avec le même UUID après une coupure réseau', async () => {
    const fetchMock = vi.fn()
        .mockResolvedValueOnce(json(initialBattle))
        .mockRejectedValueOnce(new TypeError('Réponse perdue'))
        .mockResolvedValueOnce(json(resolvedTurn))
        .mockResolvedValueOnce(json(resolvedTurn.battle))
    vi.stubGlobal('fetch', fetchMock)
    render(<BattlePage/>)
    fireEvent.click(screen.getByRole('button', {name: 'Créer le combat'}))
    const group = await screen.findByRole('group', {name: 'Attaque 1 : Bulbizarre'})
    fireEvent.click(within(group).getAllByRole('radio')[0])
    fireEvent.click(within(screen.getByRole('group', {name: 'Attaque 2 : Salamèche'})).getAllByRole('radio')[0])
    fireEvent.click(screen.getByRole('button', {name: 'Jouer le tour'}))
    const retry = await screen.findByRole('button', {name: 'Récupérer le résultat du tour'})
    expect(screen.getByRole('button', {name: 'Jouer le tour'})).toBeDisabled()
    fireEvent.click(retry)
    expect(await screen.findByText('Tour 1', {selector: 'p'})).toBeInTheDocument()
    expect(fetchMock.mock.calls[2][1].body).toBe(fetchMock.mock.calls[1][1].body)
    expect(fetchMock.mock.calls[3][1].method).toBe('GET')
    expect(screen.queryByRole('button', {name: 'Récupérer le résultat du tour'})).not.toBeInTheDocument()
})
