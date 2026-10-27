export interface Position { x: number; y: number }
export type Direction = 'up' | 'down' | 'left' | 'right'
export type TileType = 'grass' | 'path' | 'tree' | 'water' | 'bridge' | 'wall'
export type Zone = 'Clairbois' | 'Prairie des lucioles' | 'Bois des murmures' | 'Lac azur'
export type TravelMode = 'walking' | 'boat'
export interface Building extends Position { width: number; height: number; name: string; roof: string }
export interface Landmark extends Position { name: string; message: string }
export interface WorldMap {
  width: number
  height: number
  tileSize: number
  tiles: readonly TileType[]
  buildings: readonly Building[]
  landmarks: readonly Landmark[]

}
export interface PlayerState {
  travelMode: TravelMode
  position: Position
  direction: Direction
  steps: number
  visited: readonly Zone[]
}
