import { useEffect, useRef, useState } from 'react'
import type { AttackClip } from './attackPlayback'

export function AttackEffects({clip, fromPlayer}: { clip: AttackClip; fromPlayer: boolean }) {
    const host = useRef<HTMLDivElement>(null)
    // L'effet CSS commence immédiatement, même si le chunk 3D est encore en téléchargement.
    const [fallback, setFallback] = useState(true)
    useEffect(() => {
        let cancelled = false
        let dispose: (() => void) | undefined
        // Charger Three.js uniquement lorsqu'un événement d'attaque doit être affiché.
        void import('./renderAttack3D').then(({renderAttack3D}) => {
            if (cancelled || !host.current) return
            try {
                dispose = renderAttack3D(host.current, clip, fromPlayer);
                setFallback(false)
            } catch {
                setFallback(true)
            }
        }).catch(() => {
            if (!cancelled) setFallback(true)
        })
        return () => {
            cancelled = true;
            dispose?.()
        }
    }, [clip, fromPlayer])
    return <div ref={host} className="attack-effects" aria-hidden="true">
        {fallback &&
            <span className={`attack-fallback effect-${clip.kind} ${fromPlayer ? 'from-player' : 'from-enemy'}`}/>}
    </div>
}
