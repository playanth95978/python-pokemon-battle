import { BattlePage } from './battle/BattlePage'
import { useState } from 'react'
import { WorldPage } from './world/WorldPage'

export default function App() {
  const [page, setPage] = useState<'world' | 'battle'>('world')
  const [battleVisited, setBattleVisited] = useState(false)
  return <>
    <nav className="app-navigation" aria-label="Navigation principale">
      <strong>Pokémon · Clairbois</strong>
      <button type="button" aria-current={page === 'world' ? 'page' : undefined} onClick={() => setPage('world')}>Explorer</button>
      <button type="button" aria-current={page === 'battle' ? 'page' : undefined} onClick={() => {
        setBattleVisited(true); setPage('battle')
      }}>Arène</button>
      <a href="/world3d.html">Vue 3D</a>
    </nav>
    <div hidden={page !== 'world'}><WorldPage active={page === 'world'} /></div>
    {battleVisited && <div hidden={page !== 'battle'}><BattlePage /></div>}
  </>
}
