import { useCallback, useEffect, useRef, useState } from 'react'
import type { Direction, PlayerState, WorldMap } from './types'
import { nextPosition, WORLD_SPAWN, zoneAt } from './worldMap'

export const STEP_INTERVAL = 130
const KEYS: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  z: 'up', w: 'up', s: 'down', q: 'left', a: 'left', d: 'right',
}
function initialPlayer(): PlayerState {
  return { position: { ...WORLD_SPAWN }, direction: 'down', steps: 0, visited: [zoneAt(WORLD_SPAWN)] }
}

export function useWorldMovement(map: WorldMap, active: boolean) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const held = useRef<Direction | null>(null)
  const [player, setPlayer] = useState(initialPlayer)
  const move = useCallback((direction: Direction) => {
    if (!active) return
    setPlayer((previous) => {
      const position = nextPosition(map, previous.position, direction)
      const zone = zoneAt(position)
      return {
        position, direction, steps: previous.steps + Number(position !== previous.position),
        visited: previous.visited.includes(zone) ? previous.visited : [...previous.visited, zone],
      }
    })
  }, [map, active])
  const stopMoving = useCallback(() => { held.current = null }, [])
  const startMoving = useCallback((direction: Direction) => {
    held.current = direction
    move(direction)
  }, [move])
  const reset = useCallback(() => {
    held.current = null
    setPlayer(initialPlayer())
    surfaceRef.current?.focus()
  }, [])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !active) return
    function keydown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const direction = KEYS[event.key] ?? KEYS[event.key.toLowerCase()]
      if (!direction) return
      event.preventDefault()
      if (!event.repeat) startMoving(direction)
    }
    function keyup(event: KeyboardEvent) {
      if ((KEYS[event.key] ?? KEYS[event.key.toLowerCase()]) === held.current) stopMoving()
    }
    function visibility() { if (document.hidden) stopMoving() }
    const timer = window.setInterval(() => { if (held.current) move(held.current) }, STEP_INTERVAL)
    surface.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    surface.addEventListener('blur', stopMoving)
    window.addEventListener('blur', stopMoving)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.clearInterval(timer)
      stopMoving()
      surface.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      surface.removeEventListener('blur', stopMoving)
      window.removeEventListener('blur', stopMoving)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [active, move, startMoving, stopMoving])
  return { player, surfaceRef, move, startMoving, stopMoving, reset }
}
