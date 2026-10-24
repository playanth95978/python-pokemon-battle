import type { FormEvent } from 'react'
import { useState } from 'react'
import { AttackPanel } from './AttackPanel'
import { BattleArena } from './BattleArena'
import { BattleLog } from './BattleLog'
import { useBattle } from './useBattle'

// Choix du catalogue de démonstration ; aucune statistique métier n'est copiée ici.
const species = [
    {id: 'bulbizarre', name: 'Bulbizarre'},
    {id: 'salameche', name: 'Salamèche'},
    {id: 'carapuce', name: 'Carapuce'},
]

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
    const [selection, setSelection] = useState<{
        battleId: string;
        first: number | null;
        second: number | null
    } | null>(null)
    const firstMove = selection?.battleId === battle?.id ? selection?.first ?? null : null
    const secondMove = selection?.battleId === battle?.id ? selection?.second ?? null : null
    const busy = pending !== null
    const finished = battle !== null && battle.winner !== null
    const firstValid = battle?.first.attacks.some((attack) => attack.slot === firstMove && attack.pp > 0) ?? false
    const secondValid = battle?.second.attacks.some((attack) => attack.slot === secondMove && attack.pp > 0) ?? false

    function create(event: FormEvent) {
        event.preventDefault()
        void createBattle({first_species: firstSpecies, second_species: secondSpecies})
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
            <header className="mb-8 flex items-center gap-4 border-b-4 border-slate-900 pb-6">
                <span aria-hidden="true" className="pokeball"/>
                <div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Pokémon Battle</h1>
                    <p className="mt-1 text-slate-600">Un duel. Deux Pokémon. À toi de jouer.</p></div>
            </header>
            <form onSubmit={create} className="mb-6 flex flex-wrap items-end gap-4 rounded-xl bg-slate-200/60 p-5">
                {[{label: 'Combattant 1', value: firstSpecies, set: setFirstSpecies},
                    {label: 'Combattant 2', value: secondSpecies, set: setSecondSpecies}].map((field) => (
                    <label key={field.label} className="grid min-w-40 flex-1 gap-2 text-sm font-bold">
                        {field.label}
                        <select value={field.value} onChange={(event) => field.set(event.target.value)} disabled={busy}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-base font-normal">
                            {species.map((pokemon) => <option key={pokemon.id}
                                                              value={pokemon.id}>{pokemon.name}</option>)}
                        </select>
                    </label>
                ))}
                <button type="submit" disabled={busy} className="button-primary">
                    {pending === 'create' ? 'Création en cours' : battle ? 'Nouveau combat' : 'Créer le combat'}
                </button>
                {battle && <p className="w-full text-sm text-slate-600">Nouveau combat : repartir avec les Pokémon
                    sélectionnés.</p>}
            </form>
            {error && <div role="alert"
                           className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">{error}</div>}
            {needsSync && <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p className="mb-3 text-sm">Le tour a peut-être été joué. Récupère sa réponse ou relis le combat avant
                    de continuer.</p>
                {canRetry &&
                    <button onClick={() => void retryLastTurn()} disabled={busy} className="button-primary mb-3 mr-3">
                        {pending === 'turn' ? 'Récupération en cours' : 'Récupérer le résultat du tour'}
                    </button>}
                <button onClick={() => void refresh()} disabled={busy} className="button-secondary">
                    {pending === 'refresh' ? 'Actualisation en cours' : 'Relire le combat'}
                </button>
            </div>}
            {notice && <p role="status" className="mb-5 rounded-lg bg-blue-50 p-4 text-sm text-blue-900">{notice}</p>}
            <p role="status" className="sr-only">{busy ? 'Requête en cours' : ''}</p>
            {!battle ? <section className="rounded-xl border-2 border-dashed border-slate-300 px-6 py-16 text-center">
                    <h2 className="mb-2 text-2xl font-bold">L’arène t’attend</h2>
                    <p className="text-slate-600">Choisis deux Pokémon et crée ton premier combat.</p>
                </section> :
                <div aria-busy={busy} className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="grid min-w-0 gap-6">
                        <BattleArena battle={battle}/>
                        {finished ?
                            <section role="status" className="rounded-xl border-2 border-blue-700 bg-blue-50 p-6">
                                <h2 className="text-xl font-bold">Combat terminé</h2>
                                <p className="mt-2">Choisis tes Pokémon et lance un nouveau combat pour rejouer.</p>
                            </section> : <section aria-labelledby="attacks-heading"
                                                  className="rounded-xl border-2 border-slate-200 bg-white p-5">
                                <h2 id="attacks-heading" className="mb-2 text-xl font-bold">Préparer le prochain
                                    tour</h2>
                                <p className="mb-5 text-sm text-slate-600">Sélectionne une attaque pour chaque
                                    combattant.</p>
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <AttackPanel fighter={battle.first} label="Attaque 1" selected={firstMove}
                                                 disabled={busy || needsSync}
                                                 onSelect={(slot) => setSelection({
                                                     battleId: battle.id,
                                                     first: slot,
                                                     second: secondMove
                                                 })}/>
                                    <AttackPanel fighter={battle.second} label="Attaque 2" selected={secondMove}
                                                 disabled={busy || needsSync}
                                                 onSelect={(slot) => setSelection({
                                                     battleId: battle.id,
                                                     first: firstMove,
                                                     second: slot
                                                 })}/>
                                </div>
                                <button type="button" className="button-primary mt-5 w-full"
                                        disabled={busy || needsSync || !firstValid || !secondValid}
                                        onClick={() => {
                                            if (firstMove !== null && secondMove !== null) void playTurn({
                                                first_move: firstMove,
                                                second_move: secondMove
                                            })
                                        }}>
                                    {pending === 'turn' ? 'Résolution en cours' : 'Jouer le tour'}
                                </button>
                            </section>}
                    </div>
                    <BattleLog battle={battle} events={events}/>
                </div>}
        </main>
    )
}
