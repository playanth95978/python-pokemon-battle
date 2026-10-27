import { useMemo, useState } from 'react'
import type { Direction, Zone } from './types'
import { BOAT_DOCK, boatActionAtDock, TILE_COLORS, nearbyLandmark, WORLD_MAP, zoneAt } from './worldMap'
import { useWorldMovement } from './useWorldMovement'
import { WorldCanvas } from './WorldCanvas'
import './world.css'

const ZONES: Zone[] = ['Clairbois', 'Prairie des lucioles', 'Bois des murmures', 'Lac azur']
const CONTROLS: { direction: Direction; label: string; icon: string }[] = [
  { direction: 'up', label: 'Aller vers le haut', icon: '↑' },
  { direction: 'left', label: 'Aller vers la gauche', icon: '←' },
  { direction: 'down', label: 'Aller vers le bas', icon: '↓' },
  { direction: 'right', label: 'Aller vers la droite', icon: '→' },
]

export function WorldPage({ active }: { active: boolean }) {
  const { player, surfaceRef, move, startMoving, stopMoving, reset, interactWithBoat } = useWorldMovement(WORLD_MAP, active)
  const [message, setMessage] = useState('Ton aventure commence à Clairbois. Clique sur la carte, puis suis les sentiers. Le panneau à ta droite te donnera quelques indications.')
  const landmark = nearbyLandmark(WORLD_MAP, player.position)
  const boatAction = boatActionAtDock(player)
  const interactionLabel = boatAction === 'board' ? 'Embarquer' : boatAction === 'disembark' ? 'Débarquer' : 'Interagir'
  const minimapPaths = useMemo(() => {
    const paths: Record<string, string> = {}
    WORLD_MAP.tiles.forEach((tile, index) => {
      const x = index % WORLD_MAP.width, y = Math.floor(index / WORLD_MAP.width)
      paths[tile] = (paths[tile] ?? '') + `M${x} ${y}h1v1h-1z`
    })
    return Object.entries(paths)
  }, [])
  function interact() {
    if (!active) return
    stopMoving()
    if (boatAction) {
      interactWithBoat()
      setMessage(boatAction === 'board'
        ? 'À bord ! Utilise les mêmes commandes pour explorer la rivière et le lac. Pour débarquer, reviens à la case 42, 38 près du ponton et appuie sur E. Les ponts restent infranchissables en bateau.'
        : 'Te voilà sur la rive. Le bateau reste amarré au ponton pour ta prochaine promenade.')
      surfaceRef.current?.focus()
      return
    }
    if (player.travelMode === 'boat') {
      setMessage('Pour débarquer, rejoins l’embarcadère indiqué sur la mini-carte, case 42, 38, puis appuie sur E.')
      return
    }
    setMessage(landmark?.message ?? 'Approche-toi d’un panneau ou de la maison des soins pour interagir.')
  }

  return <main className="world-page">
    <header className="world-heading">
      <div><p className="world-intro">Une première escapade</p><h1>Les sentiers de Clairbois</h1>
        <p>Un village, un bois et toute une promenade devant toi.</p></div>
      <span className="world-map-size">64 × 64 cases<span>Monde 2D</span></span>
    </header>
    <div className="world-layout">
      <section className="world-play-area" aria-label="Exploration">
        <div className="world-location"><span className="world-location-dot" />{zoneAt(player.position)}
          {player.travelMode === 'boat' && <span className="world-boat-label">En bateau</span>}
          <span className="world-coordinates">Case {player.position.x}, {player.position.y}</span></div>
        <div className="world-canvas-wrap">
          <WorldCanvas map={WORLD_MAP} player={player} active={active} surfaceRef={surfaceRef} onInteract={interact} />
          <div className="world-dpad" aria-label="Commandes tactiles">
            {CONTROLS.map(({ direction, label, icon }) => <button key={direction} type="button" className={`world-key-${direction}`}
              aria-label={label}
              onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); startMoving(direction) }}
              onPointerUp={stopMoving} onPointerCancel={stopMoving} onLostPointerCapture={stopMoving}
              onClick={(event) => { if (event.detail === 0) move(direction) }}>{icon}</button>)}
          </div>
        </div>
        <div className="world-interaction">
          <span>{boatAction ? 'Embarcadère du lac' : player.travelMode === 'boat' ? 'Navigation sur le lac' : landmark ? landmark.name : 'Le chemin continue'}</span>
          <button type="button" onClick={interact} aria-label={boatAction ? interactionLabel : 'Interagir avec les alentours'}><kbd>E</kbd> {interactionLabel}</button>
        </div>
        <p role="status" className="world-dialogue">{message}</p>
      </section>
      <aside className="world-sidebar" aria-label="Carnet d’exploration">
        <section className="world-notebook">
          <h2>Ta carte</h2>
          <svg viewBox="0 0 64 64" className="world-minimap" role="img" aria-label={`Position sur la carte : ${zoneAt(player.position)}`}>
            {minimapPaths.map(([tile, path]) => <path key={tile} d={path} fill={TILE_COLORS[tile as keyof typeof TILE_COLORS]} />)}
            <rect x={BOAT_DOCK.shore.x - .5} y={BOAT_DOCK.shore.y - .5} width="2" height="2" fill="#6d422b" stroke="#fff1ca" strokeWidth=".5" />
            <circle cx={player.position.x + .5} cy={player.position.y + .5} r="1.7" fill="#fff7dc" stroke="#9f3d45" strokeWidth=".9" />
          </svg>
          <p className="world-dock-hint">Le carré brun indique l’embarcadère : rive en 41, 38.</p>
          <div className="world-progress"><strong>{player.visited.length} / 4</strong><span>lieux découverts</span></div>
          <ul className="world-zones">{ZONES.map((zone) => <li key={zone} className={player.visited.includes(zone) ? 'visited' : ''}>
            <span aria-hidden="true">{player.visited.includes(zone) ? '✓' : '○'}</span> {zone}
          </li>)}</ul>
        </section>
        <section className="world-controls">
          <h2>Prends la route</h2>
          <p id="world-controls-help">Clique sur la carte. Déplace-toi avec les flèches, ZQSD ou WASD. Appuie sur E près d’un panneau ou à l’embarcadère pour monter et descendre du bateau.</p>
          <button type="button" className="world-reset" onClick={() => {
            reset(); setMessage('Te voilà de retour à Clairbois. Une nouvelle promenade ?')
          }}>Revenir au départ</button>
        </section>
        <p className="world-prototype-note">Exploration locale, sans sauvegarde. Pikachu et Salamèche se promènent pour le décor ; les rencontres et les soins ne sont pas encore reliés aux combats.</p>
      </aside>
    </div>
  </main>
}
