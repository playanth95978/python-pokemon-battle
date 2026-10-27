import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { angleDelta, createCameraRig } from './cameraRig'
import { createFirstPersonView } from './firstPerson'

function setup() {
  const canvas = document.createElement('canvas')
  const camera = new PerspectiveCamera()
  const firstPerson = createFirstPersonView(canvas, camera)
  const rig = createCameraRig(camera, canvas, firstPerson)
  /** Glisser horizontalement avec le bouton gauche enfoncé. */
  const drag = (movementX: number) => {
    const event = new MouseEvent('pointermove')
    Object.defineProperties(event, {movementX: {value: movementX}, buttons: {value: 1}})
    canvas.dispatchEvent(event)
  }
  return {camera, firstPerson, rig, drag}
}

const framing = {offset: new Vector3(0, 4, 7), lookHeight: 0.9, lookAhead: 1.5}

describe('Caméra multi-vues', () => {
  it('garde les touches dans le sens du monde tant que la vue libre regarde vers le nord', () => {
    const {rig} = setup()
    expect(rig.mode).toBe('free')
    expect(rig.direction('up')).toBe('up')
    expect(rig.direction('left')).toBe('left')
  })

  it('tourne les touches avec la caméra quand on la fait pivoter à la souris', () => {
    const {rig, drag} = setup()
    // Un quart de tour vers la gauche : avancer mène désormais vers l'ouest.
    drag(-(Math.PI / 2) / 0.006)
    expect(rig.direction('up')).toBe('left')
    expect(rig.direction('right')).toBe('up')
  })

  it('fige le repère tant que la touche reste enfoncée', () => {
    const {rig, drag} = setup()
    rig.press()
    drag(-(Math.PI / 2) / 0.006)
    expect(rig.direction('up')).toBe('up')
    rig.release()
    expect(rig.direction('up')).toBe('left')
  })

  it('enchaîne vue libre, vue de dos et vue FPS, en partant du regard du dresseur', () => {
    const {rig, firstPerson} = setup()
    rig.cycle('right')
    expect(rig.mode).toBe('chase')
    expect(rig.direction('up')).toBe('right')
    rig.cycle('right')
    expect(rig.mode).toBe('fps')
    expect(firstPerson.enabled).toBe(true)
    rig.cycle('right')
    expect(rig.mode).toBe('free')
    expect(firstPerson.enabled).toBe(false)
    // La vue libre reprend l'angle de la vue de dos.
    expect(rig.direction('up')).toBe('right')
  })

  it('replace la caméra derrière la tête du dresseur en vue de dos', () => {
    const {rig, camera} = setup()
    rig.cycle('up')
    const target = new Vector3(10, 0, 10)
    for (let frame = 0; frame < 240; frame++) rig.update(1 / 60, target, 'right', false, framing)
    // Regard vers l'est : la caméra est à l'ouest du dresseur et le regarde.
    expect(camera.position.x).toBeLessThan(target.x - 6)
    expect(Math.abs(camera.position.z - target.z)).toBeLessThan(0.2)
  })

  it('raccourcit seulement le recul horizontal devant un mur, sans descendre au ras du sol', () => {
    const {rig, camera} = setup()
    const target = new Vector3(5, 0, 5)
    rig.snap(target, {...framing, reach: () => 0.25})
    expect(camera.position.y).toBeCloseTo(4)
    expect(camera.position.z).toBeCloseTo(5 + 7 * 0.25)
  })

  it('prend toujours le plus court chemin pour tourner', () => {
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
    expect(angleDelta(0, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
  })
})
