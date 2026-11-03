import { buildingEntrance } from '../../world/buildings'
import { WORLD_MAP, WORLD_SPAWN } from '../../world/worldMap'
const building = WORLD_MAP.buildings.find((house) => house.name === 'Prison de Clairbois')
export const PRISON_ENTRANCE = building ? buildingEntrance(building) : WORLD_SPAWN
