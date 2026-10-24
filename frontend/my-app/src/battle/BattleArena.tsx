import type { Battle } from './types'
import { PokemonCard } from './PokemonCard'

export function BattleArena({battle}: { battle: Battle }) {
    const winner = [battle.first, battle.second].find((fighter) => fighter.id === battle.winner)
    return (
        <section aria-label="Arène de combat">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold">L’arène</h2>
                <p className="rounded-full bg-slate-900 px-4 py-1 text-sm font-bold text-white" role="status">
                    {winner ? `Victoire de ${winner.species}` : `Tour ${battle.turn}`}
                </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <PokemonCard fighter={battle.first} side="first"/>
                <PokemonCard fighter={battle.second} side="second"/>
            </div>
        </section>
    )
}
