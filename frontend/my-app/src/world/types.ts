export interface Position { x: number; y: number }
export type Direction = 'up' | 'down' | 'left' | 'right'
export type TileType = 'grass' | 'path' | 'tree' | 'water' | 'bridge' | 'wall'
export type Zone = 'Clairbois' | 'Prairie des lucioles' | 'Bois des murmures' | 'Lac azur'
export type TravelMode = 'walking' | 'boat'
/** Modèles 3D de maison ; chacun a son emprise en cases (HOUSE_SIZE), à l'échelle des habitants. */
export type HouseModel = 'fantasy_house_a' | 'fantasy_house_b' | 'fantasy_inn'
export interface Building extends Position { width: number; height: number; name: string; roof: string; model: HouseModel }
export interface Landmark extends Position { name: string; message: string }
/** Mobilier du village : seules les cultures se traversent, le reste occupe sa case. */
export type PropKind = 'fountain' | 'well' | 'stall' | 'lantern' | 'bench' | 'barrels' | 'crates' | 'anvil' | 'hay' | 'fence' | 'crops' | 'cart'
export interface Prop extends Position { kind: PropKind; facing?: Direction }
export interface WorldMap {
  width: number
  height: number
  tileSize: number
  tiles: readonly TileType[]
  buildings: readonly Building[]
  landmarks: readonly Landmark[]
  props: readonly Prop[]
}
export interface PlayerState {
  travelMode: TravelMode
  position: Position
  direction: Direction
  steps: number
  visited: readonly Zone[]
}
