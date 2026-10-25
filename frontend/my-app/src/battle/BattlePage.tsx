import type { FormEvent } from 'react'
import { useState } from 'react'
import type { Battle, BattleEvent, MoveChoices } from './types'
import { AttackPanel } from './AttackPanel'
import { BattleArena } from './BattleArena'
import { BattleLog } from './BattleLog'
import { useBattle } from './useBattle'
import { usePokemonArtwork } from './usePokemonArtwork'
import { useAttackPlayback } from './useAttackPlayback'
import { useCatalogue } from './useCatalogue'
import { PokemonCatalogue } from './PokemonCatalogue'
import { battlePresentation } from './battlePresentation'
import { useBattleAudio } from './useBattleAudio'

const species = [{id: 'pikachu', name: 'Pikachu'}, {id: 'bulbasaur', name: 'Bulbizarre'}, {id: 'charmander', name: 'Salamèche'}, {
    id: 'squirtle',
    name: 'Carapuce'
}]

function BattleSession({battle, events, busy, needsSync, playTurn, playAiTurn}: {
    battle: Battle;
    events: BattleEvent[];
    busy: boolean;
    needsSync: boolean;
    playTurn: (moves: MoveChoices) => Promise<void>;
    playAiTurn: (move: number) => Promise<void>
}) {
    const [firstMove, setFirstMove] = useState<number | null>(null)
    const [secondMove, setSecondMove] = useState<number | null>(null)
    const [animations, setAnimations] = useState(true)
    const [aiOpponent, setAiOpponent] = useState(false)
    const firstArtwork = usePokemonArtwork(battle.first.species)
    const secondArtwork = usePokemonArtwork(battle.second.species)
    const {active, isPlaying, reducedMotion, revealedCount, impact} = useAttackPlayback(events, animations)
    const audio = useBattleAudio(active)
    const displayed = battlePresentation(battle, events, revealedCount)
    const finished = displayed.winner !== null
    const blocked = busy || needsSync || isPlaying
    const firstValid = battle.first.attacks.some((attack) => attack.slot === firstMove && attack.pp > 0)
    const secondValid = battle.second.attacks.some((attack) => attack.slot === secondMove && attack.pp > 0)
    const winner = [displayed.first, displayed.second].find((fighter) => fighter.id === displayed.winner)

    return <div className="battle-layout" aria-busy={busy}>
        <div className="battle-view">
            <div className="arena-toolbar">
                <button type="button" aria-pressed={audio.enabled} onClick={() => void audio.toggle()}>{audio.enabled ? 'Couper le son' : 'Activer le son'}</button>
                <label className="volume-control">Volume <input type="range" min="0" max="1" step="0.05" value={audio.volume} onChange={(event) => audio.setVolume(Number(event.target.value))}/></label>
                <label className="motion-toggle"><input type="checkbox" checked={animations}
                                                        onChange={(event) => setAnimations(event.target.checked)}/> Animations
                    d’attaque</label>
                <p className="pill" role="status">{winner ? `Victoire de ${winner.species}` : `Tour ${battle.turn}`}</p>
            </div>
            {audio.error && <p role="status" className="muted">{audio.error}</p>}
            <BattleArena battle={displayed} firstArtwork={firstArtwork} secondArtwork={secondArtwork} active={active} impact={impact} motion={animations && !reducedMotion}/>
        </div>
        <section className="card battle-commands" aria-labelledby="attacks-heading">
            <h2 id="attacks-heading">{finished ? 'Combat terminé' : 'Choisis les attaques'}</h2>
            {finished ?
                <p className="muted">{winner?.species} remporte le duel. Lance un nouveau combat pour rejouer.</p> : <>
                    <label className="motion-toggle"><input type="checkbox" checked={aiOpponent}
                        disabled={blocked || battle.turn > 0} onChange={(event) => setAiOpponent(event.target.checked)}/>
                        Adversaire IA Mistral</label>
                    <p className="muted text-sm mb-4">{aiOpponent ? 'Choisis ton attaque. L’IA choisit la sienne sans connaître ton choix.' : 'Une attaque par combattant, puis le serveur résout le tour.'}</p>
                    <div className="grid gap-5">
                        <AttackPanel fighter={displayed.first} label="Attaque 1" selected={firstMove} disabled={blocked}
                                     onSelect={setFirstMove}/>
                        {!aiOpponent && <AttackPanel fighter={displayed.second} label="Attaque 2" selected={secondMove} disabled={blocked}
                                     onSelect={setSecondMove}/>}
                    </div>
                    <div className="bottom"><span
                        className="muted text-sm">{isPlaying ? 'Lecture des attaques' : 'À toi de jouer !'}</span>
                        <button className="button-primary" disabled={blocked || !firstValid || (!aiOpponent && !secondValid)}
                                onClick={() => {
                                    if (aiOpponent && firstMove !== null) void playAiTurn(firstMove)
                                    else if (firstMove !== null && secondMove !== null) void playTurn({
                                        first_move: firstMove,
                                        second_move: secondMove
                                    })
                                }}>
                            {busy ? aiOpponent ? 'Décision IA et résolution en cours' : 'Résolution en cours' : isPlaying ? 'Animations en cours' : 'Jouer le tour'}
                        </button>
                    </div>
                </>}
        </section>
        <div className="battle-journal"><BattleLog battle={displayed} events={events.slice(0, revealedCount)}/></div>
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
        playAiTurn,
        retryLastTurn,
        refresh
    } = useBattle()
    const [firstSpecies, setFirstSpecies] = useState('bulbasaur')
    const [secondSpecies, setSecondSpecies] = useState('charmander')
    const {catalogue, error: catalogueError, loading: catalogueLoading, retry} = useCatalogue()
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
        <div className="poc-launch">
          <div><strong>Arène 3D · Pikachu contre Salamèche</strong><p>Deux modèles stylisés, une caméra libre et des attaques animées.</p></div>
          <button type="button" disabled={busy} onClick={() => {
            setFirstSpecies('pikachu'); setSecondSpecies('charmander')
            void createBattle({first_species: 'pikachu', second_species: 'charmander'})
          }}>Lancer le POC 3D</button>
        </div>
        <form onSubmit={create} className="setup-form">
            {[{label: 'Combattant 1', value: firstSpecies, set: setFirstSpecies}, {
                label: 'Combattant 2',
                value: secondSpecies,
                set: setSecondSpecies
            }].map((field) => (
                <label key={field.label}>{field.label}<select value={field.value}
                                                              onChange={(event) => field.set(event.target.value)}
                                                              disabled={busy}>
                    {catalogue ? catalogue.generations.map((generation) => <optgroup key={generation.id}
                                                                                     label={generation.name}>
                        {catalogue.species.filter((pokemon) => pokemon.generation === generation.id).map((pokemon) =>
                            <option key={pokemon.key} value={pokemon.key}>#{pokemon.id} · {pokemon.name}</option>)}
                    </optgroup>) : species.map((pokemon) => <option key={pokemon.id}
                                                                    value={pokemon.id}>{pokemon.name}</option>)}
                </select></label>
            ))}
            <button className="button-restart" type="submit"
                    disabled={busy}>{pending === 'create' ? 'Création en cours' : battle ? 'Nouveau combat' : 'Créer le combat'}</button>
        </form>
        {catalogueLoading && <p role="status" className="muted text-sm mb-3">Chargement du catalogue Pokémon</p>}
        {catalogueError && <div className="message message-warning"><p>{catalogueError}</p>
            <button className="mt-3" type="button" onClick={retry}>Réessayer le catalogue</button>
        </div>}
        {catalogue && <PokemonCatalogue catalogue={catalogue} disabled={busy}
                                        onSelect={(side, key) => side === 'first' ? setFirstSpecies(key) : setSecondSpecies(key)}/>}
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
                                 playTurn={playTurn} playAiTurn={playAiTurn}/>
            : <section className="arena arena-empty"><span aria-hidden="true" className="empty-ball">◉</span>
                <h2>L’arène t’attend</h2><p>Choisis deux Pokémon et crée ton premier combat.</p></section>}
        <footer className="credits">Illustrations : <a href="https://pokeapi.co/" target="_blank"
                                                       rel="noreferrer">PokéAPI</a> · Modèles 3D stylisés créés localement pour le POC.</footer>
    </main>
}
