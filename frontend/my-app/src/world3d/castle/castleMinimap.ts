/**
 * Mini-carte du château, dessinée depuis le plan (castleLayout.ts) : jamais en décalage avec le jeu.
 * Elle montre l'étage courant, les portes (fermées en couleur), les escaliers, les objets encore à prendre,
 * le passage secret une fois découvert, Mewtwo tant qu'il règne, et le dresseur avec son regard.
 */
import type { CastleState } from './castleLayout'
import { BOSS, DOORS, FLOOR_DEPTH, FLOOR_NAMES, FLOOR_WIDTH, ITEMS, ROOMS, STAIRS } from './castleLayout'

const CELL = 8
const STYLE_COLOR = {stone: '#8f8370', wood: '#a7774a', marble: '#a9a3b8'}
const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`

export function createCastleMinimap(parent: HTMLElement) {
    const figure = document.createElement('figure')
    figure.className = 'castle-minimap'
    figure.hidden = true
    const canvas = document.createElement('canvas')
    canvas.width = FLOOR_WIDTH * CELL
    canvas.height = FLOOR_DEPTH * CELL
    canvas.setAttribute('role', 'img')
    const caption = document.createElement('figcaption')
    figure.append(canvas, caption)
    parent.appendChild(figure)
    const context = canvas.getContext('2d')!

    const cell = (x: number, z: number, color: string, inset = 0) => {
        context.fillStyle = color
        context.fillRect(x * CELL + inset, z * CELL + inset, CELL - inset * 2, CELL - inset * 2)
    }
    const dot = (x: number, z: number, radius: number, color: string) => {
        context.fillStyle = color
        context.beginPath()
        context.arc(x * CELL, z * CELL, radius, 0, Math.PI * 2)
        context.fill()
    }

    return {
        /** `at` : position continue du dresseur (en cases) et cap ; null hors du château. */
        draw(state: CastleState | null, at: { x: number; z: number; heading: number } | null, bossDefeated: boolean) {
            figure.hidden = !state || !at
            if (!state || !at) return
            const floor = state.floor
            caption.textContent = FLOOR_NAMES[floor]
            canvas.setAttribute('aria-label', `Mini-carte : ${FLOOR_NAMES[floor]}`)
            context.fillStyle = '#16120e'
            context.fillRect(0, 0, canvas.width, canvas.height)
            for (const room of ROOMS.filter((candidate) => candidate.floor === floor)) {
                context.fillStyle = STYLE_COLOR[room.style]
                context.fillRect(room.x * CELL, room.z * CELL, room.width * CELL, room.depth * CELL)
            }
            for (const door of DOORS.filter((candidate) => candidate.floor === floor)) {
                const open = state.opened.includes(door.id)
                if (door.secret && !open) continue
                cell(door.x, door.z, door.key && !open ? (door.key === 'gold-key' ? '#f5c542' : '#d9dde3') : STYLE_COLOR.wood)
            }
            for (const stairs of STAIRS.filter((candidate) => candidate.floor === floor)) cell(stairs.x, stairs.z, '#d0473a')
            for (const item of ITEMS) {
                if (item.floor !== floor || item.reward || state.inventory.includes(item.id)) continue
                // La Potion Max reste invisible tant que son passage n'est pas découvert.
                if (DOORS.some((door) => door.secret && door.x === item.x && door.z === item.z && !state.opened.includes(door.id))) continue
                dot(item.x + 0.5, item.z + 0.5, 2.6, css(item.color))
            }
            if (floor === BOSS.floor && !bossDefeated) dot(BOSS.x + BOSS.width / 2, BOSS.z + 0.5, 4, '#b04dff')
            // Dresseur : un triangle blanc pointé dans le sens de la marche.
            context.save()
            context.translate(at.x * CELL, at.z * CELL)
            context.rotate(-at.heading)
            context.fillStyle = '#ffffff'
            context.strokeStyle = '#000000'
            context.beginPath()
            context.moveTo(0, 5)
            context.lineTo(-3.5, -3)
            context.lineTo(3.5, -3)
            context.closePath()
            context.fill()
            context.stroke()
            context.restore()
        },
    }
}
