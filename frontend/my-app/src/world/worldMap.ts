import type { Direction, PlayerState, Position, Prop, PropKind, TileType, TravelMode, WorldMap, Zone } from './types'

export const WORLD_SPAWN: Position = { x: 18, y: 36 }
export const BOAT_DOCK = {
  shore: { x: 41, y: 38 },
  water: { x: 42, y: 38 },
}
export const TILE_COLORS: Record<TileType, string> = {
  grass: '#8ebc69', path: '#dec68b', tree: '#285c47', water: '#68b6c6', bridge: '#af794f', wall: '#62845a',
}
/** Cases occupées par un mobilier plus grand qu'une case (largeur, profondeur). */
export const PROP_SIZE: Partial<Record<PropKind, [number, number]>> = { fountain: [2, 2] }
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
  // Bourg de Clairbois : maisons, chapelle, forge et ferme autour du carrefour ; la place du marché est pavée à l'est.
  const buildings = [
    { x: 10, y: 27, width: 5, height: 5, name: 'Maison du départ', roof: '#c86c4d' },
    { x: 22, y: 27, width: 6, height: 5, name: 'Maison des soins', roof: '#c2505e' },
    { x: 10, y: 39, width: 5, height: 4, name: 'Atelier du village', roof: '#637c99' },
    { x: 3, y: 27, width: 4, height: 5, name: 'Chapelle', roof: '#7b6f8f' },
    { x: 3, y: 36, width: 5, height: 4, name: 'Forge', roof: '#5b4a42' },
    { x: 3, y: 42, width: 5, height: 4, name: 'Ferme', roof: '#a8743c' },
    { x: 20, y: 20, width: 4, height: 4, name: 'Maison du garde', roof: '#4f6b8a' },
  ]
  const paint = (left: number, top: number, right: number, bottom: number, tile: TileType) => {
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) tiles[y * width + x] = tile
  }
  // Place du marché et champs labourés (terre battue, comme les chemins).
  paint(20, 36, 27, 42, 'path')
  paint(9, 45, 15, 49, 'path')
  for (const building of buildings) {
    paint(building.x, building.y, building.x + building.width - 1, building.y + building.height - 1, 'wall')
  }
  const props: Prop[] = [
    { x: 23, y: 38, kind: 'fountain' },
    { x: 20, y: 38, kind: 'stall', facing: 'right' }, { x: 20, y: 40, kind: 'stall', facing: 'right' },
    { x: 27, y: 38, kind: 'stall', facing: 'left' }, { x: 27, y: 40, kind: 'stall', facing: 'left' },
    { x: 22, y: 42, kind: 'bench', facing: 'up' }, { x: 25, y: 42, kind: 'bench', facing: 'up' },
    { x: 20, y: 42, kind: 'crates' }, { x: 27, y: 42, kind: 'barrels' },
    ...[[27, 36], [16, 30], [20, 32], [16, 38], [8, 32], [16, 44], [24, 25]]
      .map(([x, y]) => ({ x, y, kind: 'lantern' as const })),
    { x: 12, y: 37, kind: 'well' },
    { x: 8, y: 37, kind: 'anvil', facing: 'right' }, { x: 8, y: 39, kind: 'barrels' },
    { x: 8, y: 43, kind: 'hay' }, { x: 9, y: 43, kind: 'cart', facing: 'down' },
    ...[45, 47, 49].flatMap((y) => [9, 10, 11, 12, 13, 14, 15].map((x) => ({ x, y, kind: 'crops' as const }))),
  ]
  // Enclos de la ferme : barrière tout autour, ouverte face à la porte.
  for (let x = 2; x <= 8; x++) for (const y of [48, 53]) if (x !== 5 || y !== 48) props.push({ x, y, kind: 'fence' })
  for (let y = 49; y <= 52; y++) for (const x of [2, 8]) props.push({ x, y, kind: 'fence', facing: 'right' })
  for (const prop of props) {
    if (prop.kind === 'crops') continue
    const [w, h] = PROP_SIZE[prop.kind] ?? [1, 1]
    paint(prop.x, prop.y, prop.x + w - 1, prop.y + h - 1, 'wall')
  }
  return {
    width, height, tileSize: 32, tiles, buildings, props,
    landmarks: [
      { x: 20, y: 36, name: 'Panneau de Clairbois', message: 'Bienvenue à Clairbois ! Au nord, le bois des murmures. À l’est, traverse le pont pour rejoindre la rive.' },
      { x: 25, y: 32, name: 'Maison des soins', message: 'La maison des soins est encore fermée. Les soins et les rencontres seront reliés aux combats dans une prochaine étape.' },
      { x: 18, y: 15, name: 'Entrée du bois', message: 'Le bois des murmures. Suis le sentier : les arbres sont trop denses pour passer au travers.' },
      { x: 40, y: 36, name: 'Passerelle du lac', message: 'Le pont permet de traverser la rivière à pied. Un bateau t’attend au petit ponton juste au sud, sur la rive ouest.' },
      { x: 40, y: 38, name: 'Embarcadère', message: 'Le bateau t’attend à droite du panneau, sur la case 41, 38. Appuie sur E pour embarquer. Reviens à cette même rive pour débarquer. Les ponts sont trop bas pour le bateau.' },
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

export function nextPosition(
  map: WorldMap,
  position: Position,
  direction: Direction,
  mode: TravelMode = 'walking',
): Position {
  const delta = DELTAS[direction]
  const next = {
    x: position.x + delta.x,
    y: position.y + delta.y,
  }

  return canEnter(tileAt(map, next), mode) ? next : position
}

export function boatActionAtDock(player: Pick<PlayerState, 'position' | 'travelMode'>): 'board' | 'disembark' | null {
  const departure = player.travelMode === 'walking' ? BOAT_DOCK.shore : BOAT_DOCK.water
  if (player.position.x !== departure.x || player.position.y !== departure.y) return null
  return player.travelMode === 'walking' ? 'board' : 'disembark'
}

export function toggleBoatAtDock(map: WorldMap, player: PlayerState): PlayerState {
  const action = boatActionAtDock(player)
  if (!action) return player
  const travelMode = action === 'board' ? 'boat' : 'walking'
  const position = action === 'board' ? BOAT_DOCK.water : BOAT_DOCK.shore
  // Une évolution de la carte ne doit pas permettre d'embarquer dans un obstacle.
  if (!canEnter(tileAt(map, position), travelMode)) return player
  return { ...player, position: { ...position }, travelMode, direction: action === 'board' ? 'right' : 'left' }
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


export function canEnter(tile: TileType | null, mode: TravelMode): boolean {
  if (mode === 'boat') {
    return tile === 'water'
  }

  return tile === 'grass'
    || tile === 'path'
    || tile === 'bridge'
}
