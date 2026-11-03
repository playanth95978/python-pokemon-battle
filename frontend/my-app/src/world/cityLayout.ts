/** Urbanisme déterministe : les parcelles bordent des rues définies, jamais un semis aléatoire de maisons. */
import type { Building, Direction, HouseModel, Landmark, Prop, TileType } from './types'
import { buildingEntrance, createHouse, HOUSE_SIZE } from './buildings'

export interface CityStreet {
  name: string; district: string; x: number; y: number; end: number; axis: 'x' | 'y'; width: 1 | 3
}

export const CITY_STREETS: readonly CityStreet[] = [
  {name: 'Rue des deux ponts', district: 'ponts', x: 47, y: 34, end: 66, axis: 'x', width: 3},
  {name: 'Grande rue de Clairbois', district: 'halles', x: 48, y: 34, end: 156, axis: 'x', width: 3},
  {name: 'Traverse des quartiers', district: 'halles', x: 33, y: 88, end: 146, axis: 'x', width: 3},
  {name: 'Rue des voyageurs', district: 'ponts', x: 55, y: 23, end: 70, axis: 'y', width: 3},
  {name: 'Rue du rempart', district: 'bourg', x: 4, y: 65, end: 40, axis: 'x', width: 1},
  {name: 'Passage des tanneurs', district: 'artisans', x: 63, y: 17, end: 70, axis: 'y', width: 1},
  {name: 'Rue des compagnons', district: 'artisans', x: 64, y: 17, end: 104, axis: 'x', width: 1},
  {name: 'Rue des manufactures', district: 'artisans', x: 101, y: 18, end: 73, axis: 'y', width: 3},
  {name: 'Allée des ateliers', district: 'artisans', x: 48, y: 65, end: 107, axis: 'x', width: 3},
  {name: 'Quai des roseaux', district: 'port', x: 115, y: 53, end: 150, axis: 'x', width: 1},
  {name: 'Rue des entrepôts', district: 'port', x: 150, y: 18, end: 67, axis: 'y', width: 3},
  {name: 'Route des halles', district: 'port', x: 104, y: 65, end: 150, axis: 'x', width: 3},
  {name: 'Rue du moulin', district: 'fermes', x: 4, y: 70, end: 39, axis: 'x', width: 1},
  {name: 'Chemin des jardins', district: 'vergers', x: 50, y: 70, end: 104, axis: 'x', width: 1},
  {name: 'Promenade des tilleuls', district: 'vergers', x: 51, y: 66, end: 119, axis: 'y', width: 3},
  {name: 'Rue des serres', district: 'vergers', x: 105, y: 69, end: 119, axis: 'y', width: 1},
  {name: 'Promenade du sud', district: 'vergers', x: 51, y: 119, end: 146, axis: 'x', width: 1},
  {name: 'Avenue des dresseurs', district: 'halles', x: 105, y: 78, end: 150, axis: 'x', width: 3},
  {name: 'Rue des auberges', district: 'halles', x: 105, y: 100, end: 150, axis: 'x', width: 3},
  {name: 'Rue des messagers', district: 'halles', x: 115, y: 66, end: 118, axis: 'y', width: 1},
  {name: 'Boulevard de la rive', district: 'halles', x: 148, y: 68, end: 118, axis: 'y', width: 3},
]

const STYLES: Record<string, {roofs: string[]; facades: string[]; prefix: string}> = {
  ponts: {roofs: ['#97634d', '#6b7378'], facades: ['#ead6b4', '#cdb6a0'], prefix: 'Comptoir des ponts'},
  bourg: {roofs: ['#9f644c', '#8b7558'], facades: ['#d8c29c', '#d7cab3'], prefix: 'Maison du rempart'},
  artisans: {roofs: ['#53677c', '#735d4d'], facades: ['#c1c2b9', '#c7aa86'], prefix: 'Atelier des compagnons'},
  port: {roofs: ['#4e7d83', '#5d6973'], facades: ['#c2d0cb', '#bcc0b5'], prefix: 'Entrepôt des roseaux'},
  fermes: {roofs: ['#a67b43', '#966242'], facades: ['#e7d8ac', '#ccba93'], prefix: 'Maison des moissons'},
  vergers: {roofs: ['#7d607a', '#6b8866'], facades: ['#e5d9c9', '#d9c6b9'], prefix: 'Villa des jardins'},
  halles: {roofs: ['#587681', '#965d55', '#7e715b'], facades: ['#d8d1ba', '#c2cbbf', '#d9bfa9'], prefix: 'Maison des halles'},
}

interface MutableMap { width: number; height: number; tiles: TileType[]; buildings: Building[]; props: Prop[]; landmarks: Landmark[] }
interface Rect {x: number; y: number; width: number; height: number}
const inside = (x: number, y: number, r: Rect) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height

/** Habitats, cours historiques et pâtures restent libres ; les futures parcelles ne les morcellent pas. */
const RESERVED: Rect[] = [
  {x: 2, y: 15, width: 40, height: 42}, // vieux bourg, château et prairie d'Évoli
  {x: 29, y: 36, width: 4, height: 6}, // rencontre avec Salamèche
  {x: 40, y: 37, width: 6, height: 4}, // embarcadère
  ...[{x: 80, y: 34, farm: 19}, {x: 128, y: 34, farm: -24}, {x: 18, y: 88, farm: 19}, {x: 84, y: 90, farm: 19}]
    .flatMap(({x, y, farm}) => [
      {x: x - 14, y: y + farm - 1, width: 35, height: 9},
      {x: x - 14, y: y - 7, width: 29, height: 15},
    ]),
]

function streetTile(street: CityStreet, offset: number, side = 0) {
  return street.axis === 'x' ? {x: offset, y: street.y + side} : {x: street.x + side, y: offset}
}

/** Distance à l'axe d'une rue ; les extrémités ne prolongent pas artificiellement le quartier. */
export function cityStreetAt(position: {x: number; y: number}, margin = 0) {
  return CITY_STREETS.find((street) => {
    const along = street.axis === 'x' ? position.x : position.y, across = street.axis === 'x' ? position.y - street.y : position.x - street.x
    return along >= (street.axis === 'x' ? street.x : street.y) - margin && along <= street.end + margin
      && Math.abs(across) <= Math.floor(street.width / 2) + margin
  })
}

const protectedAt = (x: number, y: number) => RESERVED.some((rect) => inside(x, y, rect))

function paintCityStreets(map: MutableMap) {
  const {width, height, tiles} = map
  // Toutes les rues existent avant le lotissement : une parcelle ne peut pas couper un futur axe.
  for (const street of CITY_STREETS) {
    const start = street.axis === 'x' ? street.x : street.y, half = Math.floor(street.width / 2)
    // Le houppier des arbres déborde de leur case : dégager les abords garde la chaussée visible en 3D.
    for (let along = start - 2; along <= street.end + 2; along++) for (let side = -half - 4; side <= half + 4; side++) {
      const {x, y} = streetTile(street, along, side), index = y * width + x
      if (x > 2 && y > 2 && x < width - 3 && y < height - 3 && !protectedAt(x, y) && tiles[index] === 'tree') tiles[index] = 'grass'
    }
    for (let along = start; along <= street.end; along++) for (let side = -half; side <= half; side++) {
      const {x, y} = streetTile(street, along, side), index = y * width + x
      if (protectedAt(x, y) || tiles[index] === 'wall') continue
      tiles[index] = tiles[index] === 'water' || tiles[index] === 'bridge' ? 'bridge' : 'path'
    }
  }
}

function buildStreetLots(map: MutableMap) {
  const {width, height, tiles} = map
  let serial = 0
  for (const [streetIndex, street] of CITY_STREETS.entries()) {
    const start = street.axis === 'x' ? street.x : street.y, style = STYLES[street.district]
    for (const side of [-1, 1]) {
      for (let along = start + 2, parcel = 0; along < street.end - 3; along++, parcel++) {
        const model: HouseModel = street.district === 'port' && parcel % 3 === 0 ? 'fantasy_inn'
          : (parcel + streetIndex) % 3 === 0 ? 'fantasy_house_b' : 'fantasy_house_a'
        const facing: Direction = street.axis === 'x' ? (side < 0 ? 'down' : 'up') : (side < 0 ? 'right' : 'left')
        const [w, h] = HOUSE_SIZE[model], sideways = street.axis === 'y'
        const footprint = {width: sideways ? h : w, height: sideways ? w : h}
        const setback = Math.floor(street.width / 2) + 2
        const position = street.axis === 'x'
          ? {x: along, y: street.y + (side < 0 ? -setback - footprint.height + 1 : setback)}
          : {x: street.x + (side < 0 ? -setback - footprint.width + 1 : setback), y: along}
        const building = createHouse(position.x, position.y, model, `${style.prefix} ${serial + 1}`,
          style.roofs[parcel % style.roofs.length], facing)
        building.facade = style.facades[parcel % style.facades.length]
        building.district = street.district
        let free = true
        // Une case libre autour de chaque maison conserve ruelles, cour et passage des habitants.
        for (let y = building.y - 1; y <= building.y + building.height; y++) for (let x = building.x - 1; x <= building.x + building.width; x++) {
          const tile = tiles[y * width + x]
          if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3 || protectedAt(x, y)
            || (tile !== 'grass' && tile !== 'tree')) free = false
        }
        if (!free) continue
        along += (sideways ? footprint.height : footprint.width) + (street.district === 'vergers' ? 4 : 2) - 1
        serial++
        map.buildings.push(building)
        for (let y = building.y; y < building.y + building.height; y++) for (let x = building.x; x < building.x + building.width; x++) tiles[y * width + x] = 'wall'
        const entrance = buildingEntrance(building)
        tiles[entrance.y * width + entrance.x] = 'path'
        // La parcelle a été dégagée d'arbres : cour praticable et façade entièrement visible.
        for (let y = building.y - 1; y <= building.y + building.height; y++) for (let x = building.x - 1; x <= building.x + building.width; x++) {
          if (tiles[y * width + x] === 'tree') tiles[y * width + x] = 'grass'
        }
      }
    }
  }
}

function furnishCityStreets(map: MutableMap) {
  const {width, tiles} = map
  // Mobilier à cadence fixe, hors de la chaussée et des portes. Aucun éclairage ponctuel supplémentaire.
  const entrances = map.buildings.map(buildingEntrance)
  for (const [index, street] of CITY_STREETS.entries()) {
    const start = street.axis === 'x' ? street.x : street.y
    for (let along = start + 1; along < street.end; along += 8) {
      const {x, y} = streetTile(street, along, Math.floor(street.width / 2) + 1)
      if (tiles[y * width + x] !== 'grass' || protectedAt(x, y)
        || entrances.some((door) => Math.abs(door.x - x) + Math.abs(door.y - y) <= 1)) continue
      const kind = along === start + 1 ? 'sign' : index % 4 === 0 ? 'bench' : along % 3 === 0 ? 'planter' : 'lantern'
      map.props.push({x, y, kind, facing: street.axis === 'x' ? 'up' : 'left'})
      tiles[y * width + x] = 'wall'
    }
    const point = streetTile(street, Math.min(start + 1, street.end))
    if (tiles[point.y * width + point.x] !== 'path') continue
    map.landmarks.push({...point, name: street.name, message: `${street.name} : ${street.district === 'port' ? 'quais, pêche et entrepôts'
      : street.district === 'artisans' ? 'ateliers, livraisons et petites cours'
      : street.district === 'vergers' ? 'jardins et maisons résidentielles' : 'commerces et rues habitées'}.`})
  }
}

export function densifyClairbois(map: MutableMap) {
  paintCityStreets(map)
  buildStreetLots(map)
  furnishCityStreets(map)
}
