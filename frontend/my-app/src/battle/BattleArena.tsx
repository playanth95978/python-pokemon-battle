import { useCallback, useState } from 'react'
import type { Battle } from './types'
import type { PokemonArtwork } from './pokemonArtwork'
import type { AttackClip } from './attackPlayback'
import { PokemonCard } from './PokemonCard'
import { AttackEffects } from './AttackEffects'
import { BattleScene3D } from './BattleScene3D'
import { pocModelPath } from './pocModels'

interface Props {
    battle: Battle
    firstArtwork: PokemonArtwork | null
    secondArtwork: PokemonArtwork | null
    active: AttackClip | null
    motion?: boolean
}

export function BattleArena({battle, firstArtwork, secondArtwork, active, motion = true}: Props) {
    const [prefer3D, setPrefer3D] = useState(true)
    const [failed, setFailed] = useState(false)
    const onFailure = useCallback(() => setFailed(true), [])
    const supported = Boolean(pocModelPath(battle.first.species) && pocModelPath(battle.second.species))
    const show3D = supported && prefer3D && !failed
    return <>
        {supported && <div className="arena-mode">
            <span>{show3D ? 'POC · Modèles 3D locaux' : 'Illustrations 2D'}</span>
            {!failed && <button type="button"
                                onClick={() => setPrefer3D((value) => !value)}>{show3D ? 'Voir en 2D' : 'Voir en 3D'}</button>}
        </div>}
        {failed &&
            <p role="status" className="message message-warning">La 3D est indisponible. Le combat continue avec les
                illustrations.</p>}
        <section className={`arena${show3D ? ' arena-3d' : ''}`} aria-label="Arène de combat">
            {show3D ? <BattleScene3D battle={battle} active={active} motion={motion} onFailure={onFailure}/> : <>
                <div className="arena-ground enemy-ground" aria-hidden="true"/>
                <div className="arena-ground player-ground" aria-hidden="true"/>
            </>}
            <PokemonCard fighter={battle.second} side="second" artwork={secondArtwork} active={active}
                         statsOnly={show3D}/>
            <PokemonCard fighter={battle.first} side="first" artwork={firstArtwork} active={active} statsOnly={show3D}/>
            {!show3D && active &&
                <AttackEffects key={active.id} clip={active} fromPlayer={active.actor === battle.first.id}/>}
            <div className="attack-caption" aria-live="polite">
                {active ? `${active.actor === battle.first.id ? battle.first.species : battle.second.species} utilise ${active.name}${active.outcome === 'miss' ? ' : raté !' : active.outcome === 'immune' ? ' : aucun effet !' : ' !'}` : ''}
            </div>
        </section>
    </>
}
