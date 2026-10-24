import type { Battle } from './types'
import type { PokemonArtwork } from './pokemonArtwork'
import type { AttackClip } from './attackPlayback'
import { PokemonCard } from './PokemonCard'
import { AttackEffects } from './AttackEffects'

interface Props {
    battle: Battle
    firstArtwork: PokemonArtwork | null
    secondArtwork: PokemonArtwork | null
    active: AttackClip | null
}

export function BattleArena({battle, firstArtwork, secondArtwork, active}: Props) {
    return <section className="arena" aria-label="Arène de combat">
        <div className="arena-ground enemy-ground" aria-hidden="true"/>
        <div className="arena-ground player-ground" aria-hidden="true"/>
        <PokemonCard fighter={battle.second} side="second" artwork={secondArtwork} active={active}/>
        <PokemonCard fighter={battle.first} side="first" artwork={firstArtwork} active={active}/>
        {active && <AttackEffects key={active.id} clip={active} fromPlayer={active.actor === battle.first.id}/>}
        <div className="attack-caption" aria-live="polite">
            {active ? `${active.actor === battle.first.id ? battle.first.species : battle.second.species} utilise ${active.name}${active.outcome === 'miss' ? ' : raté !' : active.outcome === 'immune' ? ' : aucun effet !' : ' !'}` : ''}
        </div>
    </section>
}
