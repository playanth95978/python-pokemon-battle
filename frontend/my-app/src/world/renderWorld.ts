import type { PlayerState, Position, WorldMap } from './types'
import { BOAT_DOCK, cameraPosition, TILE_COLORS } from './worldMap'

type Paint = CanvasRenderingContext2D
function rect(ctx: Paint, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}
function shadow(ctx: Paint, x: number, y: number, width = 22) {
  ctx.fillStyle = '#21483140'
  ctx.beginPath(); ctx.ellipse(x, y, width / 2, 5, 0, 0, Math.PI * 2); ctx.fill()
}
function tree(ctx: Paint, x: number, y: number, variant: number) {
  shadow(ctx, x + 16, y + 28, 30)
  rect(ctx, '#705338', x + 12, y + 15, 8, 16)
  rect(ctx, '#234e3e', x + 2, y + 5, 28, 18)
  rect(ctx, variant ? '#347452' : '#3b8054', x + 5, y - 5, 22, 24)
  rect(ctx, '#4a9161', x + 9, y - 9, 14, 17)
  rect(ctx, '#6aa76b', x + 10, y - 6, 5, 5)
}
function playerSprite(ctx: Paint, player: PlayerState, x: number, y: number) {
  const feet = player.steps % 2 === 0 ? 0 : 2
  if (player.travelMode !== 'boat') {
    shadow(ctx, x + 16, y + 29)
    rect(ctx, '#344b68', x + 9, y + 21, 6, 8 - feet)
    rect(ctx, '#344b68', x + 18, y + 21, 6, 6 + feet)
  }
  rect(ctx, '#edf0da', x + 7, y + 13, 19, 11)
  rect(ctx, '#c65a4d', x + 10, y + 13, 13, 10)
  rect(ctx, '#f1c18c', x + 9, y + 1, 14, 13)
  rect(ctx, '#614739', x + 7, y, 18, 5)
  rect(ctx, '#e57459', x + 6, y - 3, 19, 7)
  rect(ctx, '#f4b768', x + 10, y - 3, 7, 3)
  rect(ctx, '#ae473e', x + (player.direction === 'left' ? 2 : 8), y + 2, 22, 3)
  if (player.direction !== 'up') {
    rect(ctx, '#303e43', x + (player.direction === 'left' ? 9 : 12), y + 8, 2, 3)
    if (player.direction === 'down') rect(ctx, '#303e43', x + 20, y + 8, 2, 3)
  } else rect(ctx, '#614739', x + 9, y + 5, 14, 7)
  rect(ctx, '#819c89', x + 22, y + 14, 5, 9)
}

function boatSprite(ctx: Paint, x: number, y: number, vertical: boolean, occupied: boolean) {
  ctx.save()
  ctx.translate(x + 16, y + 22)
  if (vertical) ctx.rotate(Math.PI / 2)
  rect(ctx, '#d3ece1', -19, 3, 38, 2)
  rect(ctx, '#3b6e8070', -18, 1, 36, 9)
  rect(ctx, '#614632', -18, -5, 36, 10)
  rect(ctx, '#8b5b38', -14, -8, 28, 17)
  rect(ctx, '#bc8951', -10, -9, 20, 15)
  rect(ctx, '#e1bc7e', -13, -8, 26, 3)
  if (!occupied) {
    rect(ctx, '#68492f', -7, -4, 3, 9)
    rect(ctx, '#68492f', 6, -4, 3, 9)
  }
  rect(ctx, '#ddb475', -19, 8, 38, 3)
  rect(ctx, '#f0cc8c', -20, 6, 7, 6)
  rect(ctx, '#f0cc8c', 13, 6, 7, 6)
  ctx.restore()
}

function pokemon(ctx: Paint, kind: 'pikachu' | 'charmander', p: Position, seconds: number, index: number, tile: number) {
  // Trajectoires décoratives fixes : aucune rencontre ni décision de combat côté client.
  const phase = (seconds * .45 + index * 2) % 16
  const offset = phase < 4 ? { x: phase, y: 0 } : phase < 8 ? { x: 4, y: phase - 4 }
    : phase < 12 ? { x: 12 - phase, y: 4 } : { x: 0, y: 16 - phase }
  const x = (p.x + offset.x) * tile, y = (p.y + offset.y) * tile
  shadow(ctx, x + 16, y + 27)
  const bob = Math.sin(seconds * 5) > 0 ? 1 : 0
  if (kind === 'pikachu') {
    rect(ctx, '#d8a63e', x + 26, y + 9, 5, 12)
    rect(ctx, '#f6d05f', x + 23, y + 6, 7, 5)
    rect(ctx, '#efc54c', x + 8, y + 10 + bob, 17, 16)
    rect(ctx, '#f8dc68', x + 6, y + 5 + bob, 20, 14)
    rect(ctx, '#f8dc68', x + 7, y - 3 + bob, 5, 12)
    rect(ctx, '#f8dc68', x + 20, y - 3 + bob, 5, 12)
    rect(ctx, '#544638', x + 7, y - 3 + bob, 5, 4)
    rect(ctx, '#544638', x + 20, y - 3 + bob, 5, 4)
    rect(ctx, '#38413b', x + 10, y + 10 + bob, 2, 3)
    rect(ctx, '#38413b', x + 21, y + 10 + bob, 2, 3)
    rect(ctx, '#d8664d', x + 6, y + 14 + bob, 4, 3)
    rect(ctx, '#d8664d', x + 23, y + 14 + bob, 4, 3)
  } else {
    rect(ctx, '#d9774a', x + 23, y + 17, 9, 7)
    rect(ctx, '#f1bb4f', x + 29, y + 9 + bob, 5, 12)
    rect(ctx, '#f9e19a', x + 30, y + 13 + bob, 3, 6)
    rect(ctx, '#df8c50', x + 8, y + 9 + bob, 17, 18)
    rect(ctx, '#f5cf8c', x + 12, y + 16 + bob, 10, 10)
    rect(ctx, '#efaa68', x + 6, y + 1 + bob, 19, 15)
    rect(ctx, '#304e4d', x + 10, y + 6 + bob, 3, 4)
    rect(ctx, '#304e4d', x + 21, y + 6 + bob, 3, 4)
  }
}

export function renderWorld(ctx: Paint, map: WorldMap, player: PlayerState, width: number, height: number,
  seconds: number, reducedMotion: boolean) {
  const size = map.tileSize, camera = cameraPosition(map, player.position, width, height)
  ctx.clearRect(0, 0, width, height)
  ctx.save(); ctx.translate(-Math.round(camera.x), -Math.round(camera.y))
  const left = Math.max(0, Math.floor(camera.x / size) - 1), top = Math.max(0, Math.floor(camera.y / size) - 1)
  const right = Math.min(map.width, Math.ceil((camera.x + width) / size) + 1)
  const bottom = Math.min(map.height, Math.ceil((camera.y + height) / size) + 2)
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const tile = map.tiles[y * map.width + x], px = x * size, py = y * size
    const variant = (x * 13 + y * 7) % 5
    rect(ctx, TILE_COLORS[tile], px, py, size, size)
    if (tile === 'grass' || tile === 'tree') {
      rect(ctx, '#749e58', px + 5 + variant * 3, py + 15, 2, 4)
      rect(ctx, '#a2c779', px + 20, py + 24, 4, 2)
      if (tile === 'grass' && (x * 7 + y) % 17 === 0) {
        rect(ctx, '#f3dc9c', px + 9, py + 8, 4, 4)
        rect(ctx, '#c87b83', px + 19, py + 19, 3, 3)
      }
    }
    if (tile === 'water') {
      const drift = reducedMotion ? 0 : Math.floor(seconds * 2) % 8
      rect(ctx, '#a6d5d1', px + (variant * 4 + drift) % 22, py + 9, 10, 2)
      rect(ctx, '#4d9fb6', px + 4, py + 23, 14, 2)
    }
    if (tile === 'path') rect(ctx, '#ccb77e', px + variant * 4, py + 7, 3, 2)
    if (tile === 'bridge') {
      rect(ctx, '#d5a16a', px, py + 2, size, 9)
      rect(ctx, '#d5a16a', px, py + 14, size, 9)
      if (y !== 34) rect(ctx, '#6d5039', px, py + (y === 33 ? 0 : 27), size, 5)
    }
  }
  for (const building of map.buildings) {
    const x = building.x * size, y = building.y * size, w = building.width * size, h = building.height * size
    rect(ctx, '#314f4240', x + 8, y + 13, w, h)
    rect(ctx, '#f2dfb2', x + 8, y + 38, w - 16, h - 38)
    rect(ctx, '#c5ad7a', x + 8, y + h - 9, w - 16, 9)
    rect(ctx, building.roof, x, y + 4, w, 58)
    rect(ctx, '#ffffff20', x + 8, y + 7, w - 16, 6)
    for (let line = 18; line < 60; line += 12) rect(ctx, '#362e3820', x, y + line, w, 2)
    rect(ctx, '#436970', x + 23, y + 80, 24, 27)
    rect(ctx, '#436970', x + w - 47, y + 80, 24, 27)
    rect(ctx, '#9dc6bf', x + 26, y + 83, 18, 3)
    rect(ctx, '#8c694b', x + w / 2 - 13, y + h - 37, 26, 37)
    if (building.name === 'Maison des soins') {
      rect(ctx, '#fff1d2', x + w / 2 - 12, y + 21, 24, 9)
      rect(ctx, '#fff1d2', x + w / 2 - 4, y + 13, 8, 25)
    }
  }
  for (const item of map.landmarks) {
    rect(ctx, '#745b3d', item.x * size + 14, item.y * size + 14, 5, 17)
    rect(ctx, '#f0da9c', item.x * size + 4, item.y * size + 3, 24, 15)
    rect(ctx, '#987a4d', item.x * size + 8, item.y * size + 7, 15, 2)
    rect(ctx, '#987a4d', item.x * size + 8, item.y * size + 12, 10, 2)
  }
  const dockX = BOAT_DOCK.shore.x * size, dockY = BOAT_DOCK.shore.y * size
  rect(ctx, '#705039', dockX, dockY + 3, size, 27)
  for (let plank = 0; plank < 4; plank++) rect(ctx, '#c39760', dockX + 2, dockY + 4 + plank * 6, size - 4, 4)
  rect(ctx, '#edcf94', dockX + 3, dockY, 4, 7)
  rect(ctx, '#edcf94', dockX + 3, dockY + 25, 4, 7)
  if (player.travelMode === 'walking') {
    boatSprite(ctx, BOAT_DOCK.water.x * size, BOAT_DOCK.water.y * size, false, false)
  }
  const time = reducedMotion ? 0 : seconds
  pokemon(ctx, 'pikachu', { x: 28, y: 29 }, time, 0, size)
  pokemon(ctx, 'charmander', { x: 35, y: 25 }, time, 1, size)
  playerSprite(ctx, player, player.position.x * size, player.position.y * size)
  if (player.travelMode === 'boat') boatSprite(ctx, player.position.x * size, player.position.y * size,
    player.direction === 'up' || player.direction === 'down', true)
  // Les cimes passent devant le personnage, les cases solides restent infranchissables.
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (map.tiles[y * map.width + x] === 'tree') tree(ctx, x * size, y * size, (x + y) % 2)
  }
  ctx.restore()
}
