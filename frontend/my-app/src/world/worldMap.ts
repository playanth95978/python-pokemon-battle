import type { Direction, Position, TileType, WorldMap, Zone } from './types'

export const WORLD_SPAWN: Position = { x: 18, y: 36 }
export const TILE_COLORS: Record<TileType, string> = {
  grass: '#8ebc69', path: '#dec68b', tree: '#285c47', water: '#68b6c6', bridge: '#af794f', wall: '#62845a',
}
const DELTAS: Record<Direction, Position> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
}

function createMap(): WorldMap {
  const width = 64, height = 64
  const tiles: TileType[] = Array.from({ length: width * height }, (_, index) => {
    const x = index % width, y = Math.floor(index / width)
    if (x < 2 || y < 2 || x > 61 || y > 61) return 'tree'
    if ((x >= 42 && x <= 45) || (x >= 36 && x <= 51 && y >= 43 && y <= 53)) {
      return y >= 33 && y <= 35 ? 'bridge' : 'water'
    }
    if ((x >= 17 && x <= 19) || (y >= 33 && y <= 35) || (y >= 12 && y <= 14 && x < 42)) return 'path'
    if ((y < 24 && x > 24 && (x * 7 + y * 3) % 9 < 6)
      || (x < 9 && y < 28) || (x > 52 && y > 37)) return 'tree'
    return 'grass'
  })
  const buildings = [
    { x: 10, y: 27, width: 5, height: 5, name: 'Maison du départ', roof: '#c86c4d' },
    { x: 22, y: 27, width: 6, height: 5, name: 'Maison des soins', roof: '#c2505e' },
    { x: 10, y: 39, width: 5, height: 4, name: 'Atelier du village', roof: '#637c99' },
  ]
  for (const building of buildings) {
    for (let y = building.y; y < building.y + building.height; y++) {
      for (let x = building.x; x < building.x + building.width; x++) tiles[y * width + x] = 'wall'
    }
  }
  return {
    width, height, tileSize: 32, tiles, buildings,
    landmarks: [
      { x: 20, y: 36, name: 'Panneau de Clairbois', message: 'Bienvenue à Clairbois ! Au nord, le bois des murmures. À l’est, traverse le pont pour rejoindre la rive.' },
      { x: 25, y: 32, name: 'Maison des soins', message: 'La maison des soins est encore fermée. Les soins et les rencontres seront reliés aux combats dans une prochaine étape.' },
      { x: 18, y: 15, name: 'Entrée du bois', message: 'Le bois des murmures. Suis le sentier : les arbres sont trop denses pour passer au travers.' },
      { x: 40, y: 36, name: 'Passerelle du lac', message: 'Le pont est le seul passage sur la rivière. Le lac azur se trouve au sud, sur la rive est.' },
      { x: 50, y: 54, name: 'Rive du lac azur', message: 'Tu as trouvé le lac azur. Un bon endroit pour une future rencontre avec un Pokémon Eau.' },
    ],
  }
}

export const WORLD_MAP = createMap()

export function tileAt(map: WorldMap, position: Position): TileType | null {
  if (!Number.isInteger(position.x) || !Number.isInteger(position.y)
    || position.x < 0 || position.y < 0 || position.x >= map.width || position.y >= map.height) return null
  return map.tiles[position.y * map.width + position.x] ?? null
}

export function nextPosition(map: WorldMap, position: Position, direction: Direction): Position {
  const delta = DELTAS[direction]
  const next = { x: position.x + delta.x, y: position.y + delta.y }
  const tile = tileAt(map, next)
  return tile === 'grass' || tile === 'path' || tile === 'bridge' ? next : position
}

export function zoneAt(position: Position): Zone {
  if (position.y < 24) return 'Bois des murmures'
  if (position.x >= 36 && position.y >= 40) return 'Lac azur'
  if (position.x < 29 && position.y >= 25 && position.y <= 44) return 'Clairbois'
  return 'Prairie des lucioles'
}

export function nearbyLandmark(map: WorldMap, position: Position) {
  return map.landmarks.find((item) => Math.abs(item.x - position.x) + Math.abs(item.y - position.y) <= 2)
}

export function cameraPosition(map: WorldMap, player: Position, width: number, height: number): Position {
  return {
    x: Math.max(0, Math.min(map.width * map.tileSize - width, (player.x + .5) * map.tileSize - width / 2)),
    y: Math.max(0, Math.min(map.height * map.tileSize - height, (player.y + .5) * map.tileSize - height / 2)),
  }
}
