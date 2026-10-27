import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { PlayerState, WorldMap } from './types'
import { renderWorld } from './renderWorld'

interface Props {
  map: WorldMap
  player: PlayerState
  active: boolean
  surfaceRef: RefObject<HTMLDivElement | null>
  onInteract: () => void
}

export function WorldCanvas({ map, player, active, surfaceRef, onInteract }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const elapsed = useRef(0)
  const currentPlayer = useRef(player)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => { currentPlayer.current = player }, [player])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !active) return
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // Le reste de l'application reste accessible si le navigateur refuse Canvas.
      setUnavailable(true)
      return
    }
    let width = 800, height = 560, frame = 0, previousTime = 0
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    function resize() {
      const bounds = canvas!.getBoundingClientRect()
      width = Math.max(1, Math.floor(bounds.width))
      height = Math.max(1, Math.floor(bounds.height))
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.round(width * ratio)
      canvas!.height = Math.round(height * ratio)
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx!.imageSmoothingEnabled = false
    }
    function paint(time: number) {
      // Une reprise d'onglet ne doit pas téléporter les promeneurs décoratifs.
      if (previousTime) elapsed.current += Math.min(time - previousTime, 80) / 1000
      previousTime = time
      renderWorld(ctx!, map, currentPlayer.current, width, height, elapsed.current, media.matches)
      frame = window.requestAnimationFrame(paint)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    frame = window.requestAnimationFrame(paint)
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame) }
  }, [active, map])

  return <div ref={surfaceRef} className="world-surface" tabIndex={0} role="group"
    aria-label="Carte explorable de Clairbois" aria-describedby="world-controls-help"
    onPointerDown={(event) => event.currentTarget.focus()}
    onKeyDown={(event) => {
      if (event.key.toLowerCase() === 'e' && !event.repeat) { event.preventDefault(); onInteract() }
    }}>
    <canvas ref={canvasRef} className="world-canvas" aria-label="Village, prairie, forêt et rivière, vus du dessus">
      Ton navigateur doit prendre en charge Canvas 2D pour afficher le monde.
    </canvas>
    {unavailable && <p role="alert" className="world-canvas-error">Canvas 2D est indisponible. Tu peux toujours rejoindre l’arène avec le menu.</p>}
    <div className="world-focus-hint" aria-hidden="true">Clique ici pour explorer</div>
  </div>
}
