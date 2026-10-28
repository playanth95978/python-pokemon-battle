import type { Building, Direction, HouseModel, PlayerState, Position, Prop, PropKind, TileType, TravelMode, WorldMap, Zone } from './types'

export const WORLD_SPAWN: Position = { x: 18, y: 36 }
export const BOAT_DOCK = {
  shore: { x: 41, y: 38 },
  water: { x: 42, y: 38 },
}
export const TILE_COLORS: Record<TileType, string> = {
  grass: '#8ebc69', path: '#dec68b', tree: '#285c47', water: '#68b6c6', bridge: '#af794f', wall: '#62845a',
}
/** Lanternes et puits du vieux bourg : Roucool s'y perche, Rose y puise l'eau. */
export const BOURG_LANTERNS = [[27, 36], [16, 30], [20, 32], [16, 38], [8, 32], [16, 44], [21, 25]] as const
export const BOURG_WELL: Position = { x: 16, y: 41 }
/**
 * Emprise de chaque modèle de maison (largeur, profondeur), à l'échelle des habitants : une porte d'environ 1,7 m
 * pour des personnages de 1,5 m. La parcelle suit le modèle, jamais l'inverse (voir villageModels.ts).
 */
export const HOUSE_SIZE: Record<HouseModel, [number, number]> = {
  fantasy_house_a: [5, 6], fantasy_house_b: [5, 8], fantasy_inn: [10, 10],
}
const house = (x: number, y: number, model: HouseModel, name: string, roof: string): Building => {
  const [width, height] = HOUSE_SIZE[model]
  return { x, y, width, height, name, roof, model }
}
/** Cases occupées par un mobilier plus grand qu'une case (largeur, profondeur). */
export const PROP_SIZE: Partial<Record<PropKind, [number, number]>> = { fountain: [2, 2] }
const DELTAS: Record<Direction, Position> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
}

/**
 * Le noyau historique reste en place : bateau, château et sauvegardes gardent leurs coordonnées.
 * `farm` : première rangée (par rapport à la place) des champs, du pré et de la pâture du quartier ; au sud en
 * général, au nord pour la rive dont le sud plonge dans le lac.
 */
export const CLAIRBOIS_DISTRICTS = [
  { id: 'artisans', name: 'Quartier des artisans', x: 80, y: 34, roof: '#697e97', farm: 19,
    houses: ['Forge des Aulnes', 'Maison du potier', 'Atelier des tissus', 'Maison du menuisier', 'Auberge des compagnons', 'Maison des apprentis', 'Halle des artisans'] },
  { id: 'port', name: 'Quartier de la rive', x: 128, y: 34, roof: '#538c92', farm: -24,
    houses: ['Maison des pêcheurs', 'Atelier des filets', 'Comptoir de la rive', 'Auberge du héron', 'Maison des passeurs', 'Entrepôt du port', 'Maison du veilleur'] },
  { id: 'fermes', name: 'Hameau des moissons', x: 18, y: 88, roof: '#a87746', farm: 19,
    houses: ['Grange des moissons', 'Maison du meunier', 'Ferme des prés', 'Maison des bergers', 'Auberge du vieux chêne', 'Grenier communal', 'Maison du maraîcher'] },
  { id: 'vergers', name: 'Quartier des vergers', x: 84, y: 90, roof: '#8d5976', farm: 19,
    houses: ['Maison du verger', 'Atelier des confitures', 'Maison des baies', 'Auberge du pommier', 'Maison des jardiniers', 'Maison des cueilleurs', 'Petite chapelle des prés'] },
] as const

function createMap(): WorldMap {
  // 160 × 128 = cinq fois les 64 × 64 cases d'origine, sans agrandir les modèles.
  const width = 160, height = 128
  const tiles: TileType[] = Array.from({ length: width * height }, (_, index) => {
    const x = index % width, y = Math.floor(index / width)
    if (x < 64 && y < 64) {
      if (x < 2 || y < 2 || x > 61 || y > 61) return 'tree'
      if ((x >= 42 && x <= 45) || (x >= 36 && x <= 51 && y >= 43 && y <= 53)) {
        return y >= 33 && y <= 35 ? 'bridge' : 'water'
      }
      if ((x >= 17 && x <= 19) || (y >= 33 && y <= 35) || (y >= 12 && y <= 14 && x < 42)) return 'path'
      if ((y < 24 && x > 24 && (x * 7 + y * 3) % 9 < 6)
        || (x < 9 && y < 28) || (x > 52 && y > 37)) return 'tree'
      return 'grass'
    }
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) return 'tree'
    if ((x >= 42 && x <= 45 && y >= 64)
      || (x >= 110 && x <= 113 && y >= 8 && y <= 62)
      || (x >= 118 && x <= 145 && y >= 54 && y <= 62)) return 'water'
    if ((y < 18 && (x * 7 + y * 3) % 11 < 7)
      || (y > 110 && (x * 3 + y * 7) % 13 < 7)
      || (x > 148 && y > 50)) return 'tree'
    return 'grass'
  })
  // Bourg de Clairbois : maisons, chapelle, forge et ferme autour du carrefour ; la place du marché est pavée à l'est.
  // Toutes les portes donnent au sud, sur la case sous le milieu de la façade.
  const buildings: Building[] = [
    house(10, 26, 'fantasy_house_a', 'Maison du départ', '#c86c4d'),
    house(23, 23, 'fantasy_inn', 'Maison des soins', '#c2505e'),
    house(10, 37, 'fantasy_house_a', 'Atelier du village', '#637c99'),
    house(3, 26, 'fantasy_house_a', 'Chapelle', '#7b6f8f'),
    house(3, 36, 'fantasy_house_a', 'Forge', '#5b4a42'),
    house(3, 43, 'fantasy_house_a', 'Ferme', '#a8743c'),
    house(20, 15, 'fantasy_house_b', 'Maison du garde', '#4f6b8a'),
  ]
  const paint = (left: number, top: number, right: number, bottom: number, tile: TileType) => {
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) tiles[y * width + x] = tile
  }
  // Une route conserve l'eau et pose un pont au franchissement d'une rivière.
  const road = (left: number, top: number, right: number, bottom: number) => {
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const index = y * width + x
      tiles[index] = tiles[index] === 'water' ? 'bridge' : 'path'
    }
  }
  road(62, 33, width - 3, 35)
  road(17, 62, 19, height - 4)
  road(18, 87, 146, 89)
  road(79, 34, 81, 110)
  road(127, 34, 129, 109)

  // Chaque quartier a sept maisons et une place, avec des métiers et des façades différents. Au nord, les portes
  // donnent sur la rue qui longe la place ; au sud, chacune a son allée jusqu'à la rue centrale. L'auberge (5e) est
  // la grande maison du quartier.
  const housePlots: [number, number, HouseModel][] = [
    [-13, -13, 'fantasy_house_a'], [-6, -15, 'fantasy_house_b'], [3, -13, 'fantasy_house_a'],
    [-7, 8, 'fantasy_house_a'], [3, 8, 'fantasy_inn'], [-13, 8, 'fantasy_house_b'], [10, -13, 'fantasy_house_a'],
  ]
  for (const district of CLAIRBOIS_DISTRICTS) {
    paint(district.x - 7, district.y - 6, district.x + 7, district.y + 6, 'path')
    road(district.x - 1, district.y - 8, district.x + 1, district.y + 18)
    road(district.x - 15, district.y - 1, district.x + 18, district.y + 1)
    // Champs, pré d'Évoli et pâture du quartier : on dégage les arbres de la lisière (les routes restent).
    for (let y = district.y + district.farm; y <= district.y + district.farm + 6; y++) for (let x = district.x - 13; x <= district.x + 19; x++) {
      if (tiles[y * width + x] === 'tree') tiles[y * width + x] = 'grass'
    }
    housePlots.forEach(([dx, dy, model], index) => {
      const building = house(district.x + dx, district.y + dy, model, district.houses[index], district.roof)
      buildings.push(building)
      // Les portes orientées au sud rejoignent la rue sans traverser leur maison.
      const doorX = building.x + Math.floor(building.width / 2), doorY = building.y + building.height
      road(Math.min(doorX, district.x), doorY, Math.max(doorX, district.x), doorY)
    })
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
    ...BOURG_LANTERNS.map(([x, y]) => ({ x, y, kind: 'lantern' as const })),
    { ...BOURG_WELL, kind: 'well' },
    { x: 8, y: 37, kind: 'anvil', facing: 'right' }, { x: 8, y: 39, kind: 'barrels' },
    { x: 8, y: 43, kind: 'hay' }, { x: 9, y: 43, kind: 'cart', facing: 'down' },
    ...[45, 47, 49].flatMap((y) => [9, 10, 11, 12, 13, 14, 15].map((x) => ({ x, y, kind: 'crops' as const }))),
  ]
  // Enclos de la ferme : barrière tout autour, ouverte face à la porte.
  for (let x = 2; x <= 8; x++) for (const y of [50, 55]) if (x !== 5 || y !== 50) props.push({ x, y, kind: 'fence' })
  for (let y = 51; y <= 54; y++) for (const x of [2, 8]) props.push({ x, y, kind: 'fence', facing: 'right' })
  for (const district of CLAIRBOIS_DISTRICTS) {
    const add = (dx: number, dy: number, kind: PropKind, facing?: Direction) =>
      props.push({x: district.x + dx, y: district.y + dy, kind, ...(facing ? {facing} : {})})
    add(3, 2, 'fountain')
    for (const y of [-4, 2, 4]) add(-6, y, 'stall', 'right')
    add(6, -4, 'stall', 'left')
    for (const x of [-6, 6]) for (const y of [-3, 3]) add(x, y, 'lantern')
    add(-4, 5, 'bench', 'up')
    add(5, 5, 'bench', 'up')
    add(8, 3, 'barrels')
    add(-9, 3, 'crates')
    add(-10, -5, district.id === 'artisans' ? 'anvil' : 'well')
    add(-9, 18, 'cart', 'down')
    add(-8, 18, 'hay')
    // Petites cultures et pâtures gardent une vie agricole dans les nouveaux quartiers.
    const farm = district.farm
    for (const dy of [2, 4, 6]) for (let dx = 3; dx <= 9; dx++) add(dx, farm + dy, 'crops')
    // La barrière s'ouvre du côté de la place.
    const gate = farm > 0 ? farm : farm + 5
    for (let dx = 13; dx <= 19; dx++) for (const dy of [farm, farm + 5]) {
      if (dx !== 15 || dy !== gate) add(dx, dy, 'fence')
    }
    for (let dy = farm + 1; dy < farm + 5; dy++) for (const dx of [13, 19]) add(dx, dy, 'fence', 'right')
  }
  for (const prop of props) {
    if (prop.kind === 'crops') continue
    const [w, h] = PROP_SIZE[prop.kind] ?? [1, 1]
    paint(prop.x, prop.y, prop.x + w - 1, prop.y + h - 1, 'wall')
  }
  return {
    width, height, tileSize: 32, tiles, buildings, props,
    landmarks: [
      { x: 20, y: 36, name: 'Panneau de Clairbois', message: 'Bienvenue à Clairbois ! Au nord, le bois des murmures. À l’est, traverse le pont pour rejoindre la rive.' },
      { x: 22, y: 32, name: 'Maison des soins', message: 'La maison des soins est encore fermée. Les soins et les rencontres seront reliés aux combats dans une prochaine étape.' },
      { x: 18, y: 15, name: 'Entrée du bois', message: 'Le bois des murmures. Suis le sentier : les arbres sont trop denses pour passer au travers.' },
      { x: 40, y: 36, name: 'Passerelle du lac', message: 'Le pont permet de traverser la rivière à pied. Un bateau t’attend au petit ponton juste au sud, sur la rive ouest.' },
      { x: 40, y: 38, name: 'Embarcadère', message: 'Le bateau t’attend à droite du panneau, sur la case 41, 38. Appuie sur E pour embarquer. Reviens à cette même rive pour débarquer. Les ponts sont trop bas pour le bateau.' },
      { x: 50, y: 54, name: 'Rive du lac azur', message: 'Tu as trouvé le lac azur. Un bon endroit pour une future rencontre avec un Pokémon Eau.' },
      ...CLAIRBOIS_DISTRICTS.map(({x, y, name}) => ({x, y, name,
        message: `${name} : maisons, commerces et habitants rythment la journée. Les grandes routes rejoignent le vieux bourg.`})),
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
  if (CLAIRBOIS_DISTRICTS.some(({x, y}) => Math.abs(position.x - x) <= 20 && Math.abs(position.y - y) <= 21)) return 'Clairbois'
  if (position.x >= 64 || position.y >= 64) {
    if (position.y < 18 || position.y > 110) return 'Bois des murmures'
    if (position.x >= 108 && position.y >= 50 && position.y <= 64) return 'Lac azur'
    return 'Prairie des lucioles'
  }
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
