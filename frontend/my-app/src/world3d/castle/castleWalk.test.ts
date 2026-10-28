import { describe, expect, it } from 'vitest'
import type { CastleEvent, CastleState } from './castleLayout'
import { STAIRS } from './castleLayout'
import type { Point } from './castleWalk'
import { walk, WALK_RADIUS } from './castleWalk'

/** Marche pendant `frames` images de 1/60 s dans une direction, en accumulant les évènements. */
function hold(state: CastleState, at: Point, dx: number, dz: number, frames = 60) {
  let current = {state, position: at, events: [] as CastleEvent[], pushing: null as ReturnType<typeof walk>['pushing']}
  const events: CastleEvent[] = []
  for (let frame = 0; frame < frames; frame++) {
    current = walk(current.state, current.position, dx, dz, 3.4 / 60, current.pushing)
    events.push(...current.events)
    if (current.events.some((event) => event.type === 'stairs' || event.type === 'exit')) break
  }
  return {...current, events}
}

const armory: CastleState = {floor: 0, x: 1, z: 3, facing: 'left', inventory: [], opened: []}

describe('Déplacement libre dans le château', () => {
  it('glisse contre un mur sans le traverser, en gardant le mouvement le long du mur', () => {
    const {position, state} = hold(armory, {x: 1.5, z: 3.5}, -Math.SQRT1_2, Math.SQRT1_2, 20)
    expect(position.x).toBeCloseTo(1 + WALK_RADIUS, 3)
    expect(position.z).toBeGreaterThan(4)
    expect(state.z).toBe(Math.floor(position.z))
  })

  it('franchit une porte d’une case même en arrivant un peu décalé', () => {
    const hall: CastleState = {floor: 0, x: 5, z: 10, facing: 'up', inventory: [], opened: []}
    const {state, position} = hold(hall, {x: 5.2, z: 10.5}, 0, -1)
    expect(state.z).toBeLessThan(8)
    // Recentré juste assez pour que le disque tienne dans l'embrasure.
    expect(position.x).toBeGreaterThanOrEqual(5 + WALK_RADIUS)
    expect(position.x).toBeLessThanOrEqual(6 - WALK_RADIUS)
  })

  it('ramasse l’objet de la case traversée', () => {
    const {events, state} = hold({...armory, x: 3, z: 6}, {x: 3.5, z: 6.5}, 0, -1, 40)
    expect(events).toContainEqual(expect.objectContaining({type: 'pickup', item: expect.objectContaining({id: 'potion'})}))
    expect(state.inventory).toEqual(['potion'])
  })

  it('signale une seule fois la porte fermée tant qu’on la pousse, puis l’ouvre avec la clé', () => {
    const gallery: CastleState = {floor: 1, x: 17, z: 6, facing: 'down', inventory: [], opened: []}
    const locked = hold(gallery, {x: 17.5, z: 6.5}, 0, 1)
    expect(locked.events.filter((event) => event.type === 'locked')).toHaveLength(1)
    expect(locked.state.z).toBe(7)
    const unlocked = hold({...gallery, inventory: ['silver-key']}, {x: 17.5, z: 6.5}, 0, 1, 90)
    expect(unlocked.events.map((event) => event.type)).toContain('unlocked')
    expect(unlocked.state.z).toBeGreaterThan(8)
  })

  it('monte l’escalier en arrivant sur sa case et réapparaît à l’étage', () => {
    const library: CastleState = {floor: 0, x: 20, z: 2, facing: 'right', inventory: [], opened: []}
    const {events, state, position} = hold(library, {x: 20.5, z: 2.5}, 1, 0)
    expect(events.at(-1)?.type).toBe('stairs')
    expect(state).toMatchObject({floor: STAIRS[0].to.floor, x: STAIRS[0].to.x, z: STAIRS[0].to.z})
    expect(position).toEqual({x: STAIRS[0].to.x + 0.5, z: STAIRS[0].to.z + 0.5})
  })

  it('bute sur le mur creux du passage secret tant qu’il n’est pas poussé', () => {
    const library: CastleState = {floor: 0, x: 12, z: 6, facing: 'left', inventory: [], opened: []}
    const closed = hold(library, {x: 12.5, z: 6.5}, -1, 0)
    expect(closed.events.map((event) => event.type)).toEqual(['hollow'])
    const open = hold({...library, opened: ['secret-passage']}, {x: 12.5, z: 6.5}, -1, 0)
    expect(open.state.x).toBeLessThan(11)
    expect(open.state.inventory).toEqual(['max-potion'])
  })
})
