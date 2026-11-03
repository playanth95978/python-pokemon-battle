import type { Building, Direction, HouseModel, Position } from './types'

/** Emprises des GLB, à l'échelle des habitants. Une rotation échange largeur et profondeur. */
export const HOUSE_SIZE: Record<HouseModel, [number, number]> = {
  fantasy_house_a: [5, 6], fantasy_house_b: [5, 8], fantasy_inn: [10, 10],
}
export const HOUSE_ANGLES: Record<Direction, number> = {down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2}

export function createHouse(x: number, y: number, model: HouseModel, name: string, roof: string, facing?: Direction): Building {
  const [w, h] = HOUSE_SIZE[model]
  const sideways = facing === 'left' || facing === 'right'
  return {x, y, width: sideways ? h : w, height: sideways ? w : h, model, name, roof, ...(facing ? {facing} : {})}
}

/** Case marchable devant la façade, partagée par les habitants et les cartes. */
export function buildingEntrance(building: Building): Position {
  const {x, y, width, height} = building
  switch (building.facing ?? 'down') {
    case 'down': return {x: x + Math.floor(width / 2), y: y + height}
    case 'up': return {x: x + Math.floor(width / 2), y: y - 1}
    case 'right': return {x: x + width, y: y + Math.floor(height / 2)}
    case 'left': return {x: x - 1, y: y + Math.floor(height / 2)}
  }
}
