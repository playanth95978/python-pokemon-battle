import type { Fighter } from './types'

export function PokemonCard({ fighter, side }: { fighter: Fighter; side: 'first' | 'second' }) {
  const percentage = Math.max(0, Math.min(100, fighter.hp / fighter.max_hp * 100))
  return (
    <article className="min-w-0 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-7">
      <p className="mb-5 text-sm font-semibold text-slate-500">{side === 'first' ? 'Combattant 1' : 'Combattant 2'}</p>
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 className="break-words text-2xl font-extrabold text-slate-900 sm:text-3xl">{fighter.species}</h2>
        <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-sm font-semibold">Niv. {fighter.level}</span>
      </div>
      <div className="mb-2 flex justify-between text-sm font-semibold">
        <span>Points de vie</span><span>{fighter.hp} / {fighter.max_hp}</span>
      </div>
      <div role="progressbar" aria-label={`PV de ${fighter.species}, combattant ${side === 'first' ? 1 : 2}`}
        aria-valuenow={fighter.hp} aria-valuemin={0} aria-valuemax={fighter.max_hp}
        className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${percentage > 50 ? 'bg-emerald-600' : percentage > 20 ? 'bg-amber-500' : 'bg-red-600'}`}
          style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-500">{fighter.hp === 0 ? 'K.O.' : 'En combat'}</p>
    </article>
  )
}
