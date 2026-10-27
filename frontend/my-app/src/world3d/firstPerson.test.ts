import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { createFirstPersonView, relativeDirection } from './firstPerson'

describe('Vue à la première personne', () => {
  it('suspend le regard pendant le combat et conserve le mode à la reprise', () => {
    const camera = new PerspectiveCamera()
    const view = createFirstPersonView(document.createElement('canvas'), camera)
    view.toggle('up')
    const move = () => {
      const event = new MouseEvent('mousemove', {buttons: 1})
      Object.defineProperties(event, {movementX: {value: 100}, movementY: {value: 0}})
      window.dispatchEvent(event)
      view.place(new Vector3())
    }
    view.setActive(false)
    view.toggle('down')
    move()
    expect(view.enabled).toBe(true)
    expect(camera.rotation.y).toBe(0)
    view.setActive(true)
    move()
    expect(camera.rotation.y).toBe(-0.25)
    view.setActive(false)
  })

  it('avance vers le nord et se décale sur les côtés quand le regard est au nord', () => {
    expect(relativeDirection(0, 'up')).toBe('up')
    expect(relativeDirection(0, 'down')).toBe('down')
    expect(relativeDirection(0, 'left')).toBe('left')
    expect(relativeDirection(0, 'right')).toBe('right')
  })

  it('tourne les touches avec le regard, à la direction la plus proche', () => {
    expect(relativeDirection(Math.PI / 2, 'up')).toBe('left')
    expect(relativeDirection(-Math.PI / 2, 'up')).toBe('right')
    expect(relativeDirection(Math.PI, 'left')).toBe('right')
    expect(relativeDirection(-Math.PI / 2 - 0.3, 'right')).toBe('down')
  })

  it('reste juste après plusieurs tours complets', () => {
    expect(relativeDirection(Math.PI * 4 + 0.2, 'up')).toBe('up')
    expect(relativeDirection(-Math.PI * 6 + Math.PI / 2, 'down')).toBe('right')
  })
})
