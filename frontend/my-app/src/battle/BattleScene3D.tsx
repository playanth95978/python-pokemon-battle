import { useEffect, useRef, useState } from 'react'
import type { BattleSceneController } from './createBattleScene3D'
import type { Battle } from './types'
import type { AttackClip } from './attackPlayback'

interface Props { battle: Battle; active: AttackClip | null; motion: boolean; onFailure: () => void }

export function BattleScene3D({ battle, active, motion, onFailure }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<BattleSceneController | null>(null)
  const latest = useRef({ battle, active, motion })
  const [ready, setReady] = useState(false)
  useEffect(() => { latest.current = { battle, active, motion }; scene.current?.update(battle, active, motion) }, [battle, active, motion])
  const firstName = battle.first.species, secondName = battle.second.species
  useEffect(() => {
    let cancelled = false
    let created: BattleSceneController | null = null
    const element = host.current
    if (!element) return
    element.addEventListener('scene-unavailable', onFailure)
    void import('./createBattleScene3D').then(async ({ createBattleScene3D }) => {
      if (cancelled) return
      created = await createBattleScene3D(element, firstName, secondName)
      if (cancelled) { created.dispose(); return }
      scene.current = created
      const current = latest.current
      created.update(current.battle, current.active, current.motion)
      setReady(true)
    }).catch(() => { if (!cancelled) onFailure() })
    return () => {
      cancelled = true; element.removeEventListener('scene-unavailable', onFailure)
      created?.dispose(); scene.current = null
    }
  }, [firstName, secondName, onFailure])
  return <>
    <div ref={host} className="battle-scene-3d" role="img" aria-label={`Arène 3D : ${firstName} contre ${secondName}`} />
    {!ready && <p role="status" className="scene-loading">Chargement des modèles 3D</p>}
    <div className="scene-camera-controls" aria-label="Caméra 3D">
      <button type="button" disabled={!ready} onClick={() => scene.current?.rotate(-Math.PI / 8)} aria-label="Tourner la caméra à gauche">↶</button>
      <button type="button" disabled={!ready} onClick={() => scene.current?.resetCamera()}>Recentrer</button>
      <button type="button" disabled={!ready} onClick={() => scene.current?.rotate(Math.PI / 8)} aria-label="Tourner la caméra à droite">↷</button>
    </div>
    <p className="scene-hint">Glisse pour tourner · Molette pour zoomer</p>
  </>
}
