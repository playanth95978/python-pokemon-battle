import { useState } from 'react'
import type { Fighter } from './types'
import type { PokemonArtwork } from './pokemonArtwork'
import type { AttackClip } from './attackPlayback'

interface Props { fighter: Fighter; side: 'first' | 'second'; artwork: PokemonArtwork | null; active: AttackClip | null }

function PokemonSprite({ artwork, species }: { artwork: PokemonArtwork | null; species: string }) {
  const [failed, setFailed] = useState<string[]>([])
  const image = [artwork?.primary, artwork?.fallback].find((url) => url && !failed.includes(url))
  return image ? <img className="sprite" src={image} alt={species} decoding="async" draggable={false}
    onError={() => setFailed((previous) => [...previous, image])} />
    : <div className="sprite sprite-placeholder" role="img" aria-label={`${species}, illustration indisponible`}>
      <span aria-hidden="true">?</span><small>Illustration indisponible</small>
    </div>
}

export function PokemonCard({ fighter, side, artwork, active }: Props) {
  const percentage = Math.max(0, Math.min(100, fighter.hp / fighter.max_hp * 100))
  const attacking = active?.actor === fighter.id
  const impacted = active?.target === fighter.id && active.outcome === 'hit'
  return <article className={`fighter ${side === 'first' ? 'player' : 'enemy'}`}>
    <div key={active?.id ?? 'idle'} className={`sprite-shell ${attacking ? 'attacking' : ''} ${impacted ? 'impact' : ''} ${fighter.hp === 0 && !active ? 'fainted' : ''}`}>
      <PokemonSprite key={fighter.species} artwork={artwork} species={fighter.species} />
    </div>
    <div className="stats">
      <div className="fighter-name"><h2>{fighter.species}</h2><span>Niv. {fighter.level}</span></div>
      <p className="fighter-side">Combattant {side === 'first' ? 1 : 2}{fighter.hp === 0 ? ' · K.O.' : ''}</p>
      <div role="progressbar" aria-label={`PV de ${fighter.species}, combattant ${side === 'first' ? 1 : 2}`}
        aria-valuenow={fighter.hp} aria-valuemin={0} aria-valuemax={fighter.max_hp} className="hpbar">
        <div className="hpfill" style={{ width: `${percentage}%`, background: percentage > 50 ? '#4ade80' : percentage > 25 ? '#facc15' : '#fb7185' }} />
      </div>
      <p className="hptext">{fighter.hp} / {fighter.max_hp} PV</p>
    </div>
  </article>
}
