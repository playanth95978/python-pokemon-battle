import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Battle, BattleEvent, MoveChoices } from './types'
import { AttackPanel } from './AttackPanel'
import { BattleArena } from './BattleArena'
import { BattleLog } from './BattleLog'
import { useBattle } from './useBattle'
import { usePokemonArtwork } from './usePokemonArtwork'
import { useAttackPlayback } from './useAttackPlayback'

const species = [{id: 'bulbizarre', name: 'Bulbizarre'}, {id: 'salameche', name: 'Salamèche'}, {
    id: 'carapuce',
    name: 'Carapuce'
}]

function BattleSession({battle, events, busy, needsSync, playTurn}: {
    battle: Battle;
    events: BattleEvent[];
    busy: boolean;
    needsSync: boolean;
    playTurn: (moves: MoveChoices) => Promise<void>
}) {
    const [firstMove, setFirstMove] = useState<number | null>(null)
    const [secondMove, setSecondMove] = useState<number | null>(null)
    const [animations, setAnimations] = useState(true)
    const firstArtwork = usePokemonArtwork(battle.first.species)
    const secondArtwork = usePokemonArtwork(battle.second.species)
    const {active, isPlaying} = useAttackPlayback(events, animations)
    const finished = battle.winner !== null
    const blocked = busy || needsSync || isPlaying
    const firstValid = battle.first.attacks.some((attack) => attack.slot === firstMove && attack.pp > 0)
    const secondValid = battle.second.attacks.some((attack) => attack.slot === secondMove && attack.pp > 0)
    const winner = [battle.first, battle.second].find((fighter) => fighter.id === battle.winner)

    return <div className="battle-layout" aria-busy={busy}>
        <div className="battle-view">
            <div className="arena-toolbar">
                <label className="motion-toggle"><input type="checkbox" checked={animations}
                                                        onChange={(event) => setAnimations(event.target.checked)}/> Animations
                    d’attaque</label>
                <p className="pill" role="status">{winner ? `Victoire de ${winner.species}` : `Tour ${battle.turn}`}</p>
            </div>
            <BattleArena battle={battle} firstArtwork={firstArtwork} secondArtwork={secondArtwork} active={active}/>
        </div>
        <section className="card battle-commands" aria-labelledby="attacks-heading">
            <h2 id="attacks-heading">{finished ? 'Combat terminé' : 'Choisis les attaques'}</h2>
            {finished ?
                <p className="muted">{winner?.species} remporte le duel. Lance un nouveau combat pour rejouer.</p> : <>
                    <p className="muted text-sm mb-4">Une attaque par combattant, puis le serveur résout le tour.</p>
                    <div className="grid gap-5">
                        <AttackPanel fighter={battle.first} label="Attaque 1" selected={firstMove} disabled={blocked}
                                     onSelect={setFirstMove}/>
                        <AttackPanel fighter={battle.second} label="Attaque 2" selected={secondMove} disabled={blocked}
                                     onSelect={setSecondMove}/>
                    </div>
                    <div className="bottom"><span
                        className="muted text-sm">{isPlaying ? 'Lecture des attaques' : 'À toi de jouer !'}</span>
                        <button className="button-primary" disabled={blocked || !firstValid || !secondValid}
                                onClick={() => {
                                    if (firstMove !== null && secondMove !== null) void playTurn({
                                        first_move: firstMove,
                                        second_move: secondMove
                                    })
                                }}>
                            {busy ? 'Résolution en cours' : isPlaying ? 'Animations en cours' : 'Jouer le tour'}
                        </button>
                    </div>
                </>}
        </section>
        <div className="battle-journal"><BattleLog battle={battle} events={events}/></div>
    </div>
}

export function BattlePage() {
    const {
        battle,
        events,
        pending,
        error,
        notice,
        needsSync,
        canRetry,
        createBattle,
        playTurn,
        retryLastTurn,
        refresh
    } = useBattle()
    const [firstSpecies, setFirstSpecies] = useState('bulbizarre')
    const [secondSpecies, setSecondSpecies] = useState('salameche')
    const busy = pending !== null

    function create(event: FormEvent) {
        event.preventDefault()
        void createBattle({first_species: firstSpecies, second_species: secondSpecies})
    }

    return <main className="battle-page">
        <header className="top">
            <div><h1><span aria-hidden="true">⚡ </span>Pokémon Battle</h1><p className="sub">Un duel, deux Pokémon. Que
                le meilleur gagne.</p></div>
            <span className="mode-tag">1 contre 1</span>
        </header>
        <form onSubmit={create} className="setup-form">
            {[{label: 'Combattant 1', value: firstSpecies, set: setFirstSpecies}, {
                label: 'Combattant 2',
                value: secondSpecies,
                set: setSecondSpecies
            }].map((field) => (
                <label key={field.label}>{field.label}<select value={field.value}
                                                              onChange={(event) => field.set(event.target.value)}
                                                              disabled={busy}>
                    {species.map((pokemon) => <option key={pokemon.id} value={pokemon.id}>{pokemon.name}</option>)}
                </select></label>
            ))}
            <button className="button-restart" type="submit"
                    disabled={busy}>{pending === 'create' ? 'Création en cours' : battle ? 'Nouveau combat' : 'Créer le combat'}</button>
        </form>
        {error && <div role="alert" className="message message-error">{error}</div>}
        {needsSync && <div className="message message-warning">
            <p>Le tour a peut-être été joué. Récupère sa réponse ou relis le combat avant de continuer.</p>
            <div className="flex flex-wrap gap-3 mt-3">
                {canRetry && <button onClick={() => void retryLastTurn()}
                                     disabled={busy}>{pending === 'turn' ? 'Récupération en cours' : 'Récupérer le résultat du tour'}</button>}
                <button onClick={() => void refresh()}
                        disabled={busy}>{pending === 'refresh' ? 'Actualisation en cours' : 'Relire le combat'}</button>
            </div>
        </div>}
        {notice && <p role="status" className="message">{notice}</p>}
        <p className="sr-only" role="status">{busy ? 'Requête en cours' : ''}</p>
        {battle ? <BattleSession key={battle.id} battle={battle} events={events} busy={busy} needsSync={needsSync}
                                 playTurn={playTurn}/>
            : <section className="arena arena-empty"><span aria-hidden="true" className="empty-ball">◉</span>
                <h2>L’arène t’attend</h2><p>Choisis deux Pokémon et crée ton premier combat.</p></section>}
        <footer className="credits">Illustrations : <a href="https://pokeapi.co/" target="_blank"
                                                       rel="noreferrer">PokéAPI</a></footer>
    </main>
}
