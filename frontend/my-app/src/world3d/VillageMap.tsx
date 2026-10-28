import { useEffect, useMemo, useRef, useState } from 'react'
import type { Direction, Position, TileType, WorldMap } from '../world/types'
import { BOAT_DOCK, WORLD_SPAWN } from '../world/worldMap'
import { CASTLE_DOORSTEP } from './castle/castleArea'
import { CASTLE_AREA } from './castle/castleArea'
import { EXIT } from './worldExit'

export interface MapPoint extends Position { id: string; name: string; description: string; category: 'village' | 'nature' | 'rencontre' }
export interface MapLocation { position: Position; direction: Direction; insideCastle: boolean }
interface Props { map: WorldMap; location: MapLocation; extraPoints: MapPoint[]; onClose: () => void }

const COLORS: Record<TileType, string> = {
    grass: '#819965', path: '#d8c28f', tree: '#354f3e', water: '#638e9a', bridge: '#a5774f', wall: '#635247',
}
const HEADINGS: Record<Direction, number> = {up: 0, right: 90, down: 180, left: 270}
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function mapPoints(map: WorldMap, extra: MapPoint[]): MapPoint[] {
    const points: MapPoint[] = map.landmarks.map((point, index) => ({...point, id: `lieu-${index}`,
        description: point.message, category: /lac|bois|embarcadère/i.test(point.name) ? 'nature' : 'village'}))
    for (const [index, building] of map.buildings.entries()) {
        if (points.some((point) => point.name === building.name)) continue
        points.push({id: `maison-${index}`, name: building.name, description: 'Bâtiment du village. Le repère indique son entrée.',
            x: building.x + Math.floor(building.width / 2), y: building.y + building.height, category: 'village'})
    }
    return [...points,
        {id: 'depart', name: 'Point de départ', description: 'Le carrefour du vieux bourg.', ...WORLD_SPAWN, category: 'village'},
        {id: 'marche', name: 'Marché du vieux bourg', description: 'La place de la fontaine et les étals.', x: 24, y: 37, category: 'village'},
        {id: 'chateau', name: 'Château hanté', description: 'L’entrée du château se trouve sur son rempart ouest.', ...CASTLE_DOORSTEP, category: 'village'},
        {id: 'bateau', name: 'Bateau', description: 'Appuie sur E à cet endroit pour embarquer ou débarquer.', ...BOAT_DOCK.shore, category: 'nature'},
        {id: 'sortie', name: 'Sortie vers le monde ouvert', description: 'Suis la route vers l’est pour quitter Clairbois.', x: EXIT.x, y: 34, category: 'nature'},
        ...extra,
    ]
}

/** Un tracé par type de sol, avec les cases voisines fusionnées : pas de milliers de nœuds SVG. */
function terrainPaths(map: WorldMap) {
    const paths = new Map<TileType, string>()
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width;) {
            const tile = map.tiles[y * map.width + x], start = x++
            while (x < map.width && map.tiles[y * map.width + x] === tile) x++
            paths.set(tile, (paths.get(tile) ?? '') + `M${start} ${y}h${x - start}v1H${start}z`)
        }
    }
    return [...paths]
}

export function VillageMap({map, location, extraPoints, onClose}: Props) {
    const dialog = useRef<HTMLDialogElement>(null)
    const [query, setQuery] = useState('')
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const points = useMemo(() => mapPoints(map, extraPoints), [map, extraPoints])
    const paths = useMemo(() => terrainPaths(map), [map])
    const visible = points.filter((point) => normalize(point.name).includes(normalize(query)))
    const selected = points.find((point) => point.id === selectedId)
    const at = location.insideCastle ? CASTLE_DOORSTEP : location.position

    useEffect(() => {
        const element = dialog.current!
        element.showModal()
        return () => element.close()
    }, [])

    return <dialog ref={dialog} className="village-map-dialog" aria-labelledby="village-map-title"
        onCancel={(event) => { event.preventDefault(); onClose() }}>
        <header className="village-map-header">
            <div><h1 id="village-map-title">Carte de Clairbois</h1><p>{map.width} × {map.height} cases · {location.insideCastle ? 'Tu es dans le château' : `Tu es en ${at.x}, ${at.y}`}</p></div>
            <button type="button" onClick={onClose} autoFocus>Fermer la carte <kbd>C</kbd></button>
        </header>
        <div className="village-map-layout">
            <section className="village-map-drawing" aria-label="Plan du village">
                <svg viewBox={`-4 -6 ${map.width + 8} ${map.height + 12}`} role="img"
                    aria-label={`Carte de Clairbois, position du joueur en ${at.x}, ${at.y}`}>
                    <rect x="-4" y="-6" width={map.width + 8} height={map.height + 12} fill="#e5d6b4" />
                    {paths.map(([tile, path]) => <path key={tile} d={path} fill={COLORS[tile]} />)}
                    <rect x={CASTLE_AREA.x} y={CASTLE_AREA.y} width={CASTLE_AREA.width} height={CASTLE_AREA.depth} fill="#403d49" stroke="#c0a677" strokeWidth="0.5" />
                    <text x={map.width - 3} y="-1" className="village-map-north">↑ N</text>
                    {visible.map((point) => <g key={point.id} role="button" tabIndex={0}
                        aria-label={`Repérer ${point.name}`} aria-pressed={selectedId === point.id}
                        className={`village-map-pin ${point.category}`} transform={`translate(${point.x + 0.5} ${point.y + 0.5})`}
                        onClick={() => setSelectedId(point.id)} onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(point.id) }
                        }}>
                        <title>{point.name}</title><circle r="1.5" />
                        {selectedId === point.id && <circle className="village-map-selected" r="3.2" />}
                    </g>)}
                    <g transform={`translate(${at.x + 0.5} ${at.y + 0.5})`} className="village-map-player">
                        <circle r="2.8" /><path d="M0 -2 L1.6 1.7 L0 0.8 L-1.6 1.7 Z" transform={`rotate(${HEADINGS[location.direction]})`} />
                        <title>Vous êtes ici</title>
                    </g>
                </svg>
                <div className="village-map-legend"><span>● Vous êtes ici</span><span>● Village</span><span>● Nature et voyage</span><span>● Rencontre</span></div>
                <div className="village-map-detail" role="status">
                    <strong>{selected?.name ?? 'Choisis un point d’intérêt'}</strong>
                    <p>{selected ? `${selected.description} Case ${selected.x}, ${selected.y}.` : 'Clique sur un repère ou choisis un lieu dans la liste.'}</p>
                </div>
            </section>
            <aside className="village-map-places" aria-label="Points d’intérêt">
                <label htmlFor="village-map-search">Rechercher un lieu</label>
                <input id="village-map-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Château, soins, artisans" />
                <p>{visible.length} lieux</p>
                <ul>{visible.map((point) => <li key={point.id}><button type="button" aria-pressed={selectedId === point.id}
                    onClick={() => setSelectedId(point.id)}><span>{point.name}</span><small>{point.x}, {point.y}</small></button></li>)}</ul>
                {visible.length === 0 && <p>Aucun lieu trouvé.</p>}
            </aside>
        </div>
        <footer className="village-map-footer">C ou Échap pour fermer · L’exploration est en pause</footer>
    </dialog>
}
