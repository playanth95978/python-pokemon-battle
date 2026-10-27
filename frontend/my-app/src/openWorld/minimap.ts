import type { Direction, Position } from '../world/types'
import type { Biome, WorldGenerator, WorldSample } from './worldGenerator'
import { WORLD_SIZE } from './worldGenerator'
import { blocksMovement, plantAt } from './vegetation'
import { minimapOffset, playerHeading } from './minimapProjection'
import './minimap.css'

type RGB = readonly [number, number, number]
const COLORS: Record<Biome, RGB> = {
    deep_water: [34, 66, 86], shallow_water: [68, 116, 132], river: [78, 139, 156],
    beach: [211, 195, 146], plains: [134, 160, 109], forest: [64, 100, 77],
    swamp: [94, 117, 85], desert: [192, 166, 115], tundra: [149, 160, 151],
    mountain: [136, 135, 124], snow: [222, 230, 220],
}
const SIZE = 192, CENTER = SIZE / 2, RADIUS = 87
const GRID = 72, SAMPLE_STEP = 4, MAX_CACHED_SAMPLES = 12_000
const UPDATE_INTERVAL = 150, SAMPLE_BUDGET_MS = 1.5
// Remplir d'abord le voisinage du personnage, puis les bords du radar.
const SAMPLE_ORDER = Array.from({length: GRID * GRID}, (_, index) => index).sort((a, b) => {
    const distance = (index: number) => Math.abs(index % GRID - GRID / 2) + Math.abs(Math.floor(index / GRID) - GRID / 2)
    return distance(a) - distance(b)
})

function terrainColor(sample: WorldSample): RGB {
    const base = COLORS[sample.biome]
    const shade = Math.min(15, Math.max(-12, sample.height * .3))
    return [base[0] + shade, base[1] + shade, base[2] + shade]
}

/** Radar local : aucun parcours des 100 millions de cases, aucun second état de déplacement. */
export function createMinimap(world: WorldGenerator, spawn: Position) {
    const element = document.createElement('section')
    element.className = 'open-world-radar'
    element.setAttribute('aria-label', 'Mini-carte du monde ouvert')
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'radar-toggle'
    toggle.textContent = 'Mini-carte'
    toggle.setAttribute('aria-expanded', 'true')
    const panel = document.createElement('div')
    panel.className = 'radar-panel'
    const canvas = document.createElement('canvas')
    canvas.className = 'radar-canvas'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'Radar : joueur au centre, nord et point de départ')
    const coordinates = document.createElement('p')
    coordinates.className = 'radar-coordinates'
    const legend = document.createElement('p')
    legend.className = 'radar-legend'
    legend.textContent = '▲ Joueur · ◆ Départ · N Nord'
    panel.append(canvas, coordinates, legend)
    element.append(toggle, panel)
    toggle.setAttribute('aria-label', 'Masquer la mini-carte')
    const onToggle = () => {
        panel.hidden = !panel.hidden
        toggle.setAttribute('aria-expanded', String(!panel.hidden))
        toggle.setAttribute('aria-label', panel.hidden ? 'Afficher la mini-carte' : 'Masquer la mini-carte')
    }
    toggle.addEventListener('click', onToggle)
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.height = SIZE * ratio
    const ctx = canvas.getContext('2d')
    const terrain = document.createElement('canvas')
    terrain.width = terrain.height = GRID
    const terrainContext = terrain.getContext('2d')
    const pixels = terrainContext?.createImageData(GRID, GRID)
    const samples = new Map<string, RGB>()
    let lastUpdate = -Infinity, disposed = false
    if (!ctx || !terrainContext || !pixels) {
        coordinates.textContent = 'Mini-carte indisponible dans ce navigateur.'
    }

    function update(now: number, position: Position, direction: Direction, cameraYaw: number) {
        if (disposed || panel.hidden || !ctx || !terrainContext || !pixels || now - lastUpdate < UPDATE_INTERVAL) return
        lastUpdate = now
        const originX = Math.floor(position.x / SAMPLE_STEP) - GRID / 2
        const originY = Math.floor(position.y / SAMPLE_STEP) - GRID / 2
        const deadline = performance.now() + SAMPLE_BUDGET_MS
        for (const index of SAMPLE_ORDER) {
            const x = (originX + index % GRID) * SAMPLE_STEP + SAMPLE_STEP / 2
            const y = (originY + Math.floor(index / GRID)) * SAMPLE_STEP + SAMPLE_STEP / 2
            const key = `${x},${y}`
            let color = samples.get(key)
            if (!color && x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE && performance.now() < deadline) {
                const here = world.sample(x + .5, y + .5)
                const plant = plantAt(world, x, y, here)
                color = terrainColor(here)
                if (blocksMovement(plant)) {
                    color = plant?.species === 'rock' ? [108, 111, 106] : [47, 76, 60]
                }
                samples.set(key, color)
                if (samples.size > MAX_CACHED_SAMPLES) samples.delete(samples.keys().next().value!)
            }
            const offset = index * 4
            pixels.data[offset] = color?.[0] ?? 32
            pixels.data[offset + 1] = color?.[1] ?? 45
            pixels.data[offset + 2] = color?.[2] ?? 46
            pixels.data[offset + 3] = 255
        }
        terrainContext.putImageData(pixels, 0, 0)
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        ctx.clearRect(0, 0, SIZE, SIZE)
        ctx.fillStyle = '#101c23'
        ctx.beginPath(); ctx.arc(CENTER, CENTER, RADIUS + 5, 0, Math.PI * 2); ctx.fill()
        ctx.save()
        ctx.beginPath(); ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2); ctx.clip()
        ctx.translate(CENTER, CENTER)
        ctx.rotate(cameraYaw)
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(terrain, originX * SAMPLE_STEP - position.x, originY * SAMPLE_STEP - position.y,
            GRID * SAMPLE_STEP, GRID * SAMPLE_STEP)
        ctx.restore()
        ctx.strokeStyle = '#e4edd570'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2); ctx.stroke()
        const home = minimapOffset(spawn, position, cameraYaw, 1)
        if (Math.hypot(home.x, home.y) < RADIUS - 10) {
            ctx.fillStyle = '#f1ca80'
            ctx.save(); ctx.translate(CENTER + home.x, CENTER + home.y); ctx.rotate(Math.PI / 4)
            ctx.fillRect(-3, -3, 6, 6); ctx.restore()
        }
        const north = minimapOffset({x: position.x, y: position.y - RADIUS + 12}, position, cameraYaw, 1)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 12px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('N', CENTER + north.x, CENTER + north.y)
        ctx.save(); ctx.translate(CENTER, CENTER); ctx.rotate(playerHeading(direction, cameraYaw))
        ctx.fillStyle = '#f7faf2'
        ctx.strokeStyle = '#172e38'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8)
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore()
        coordinates.textContent = `${Math.floor(position.x)}, ${Math.floor(position.y)} · rayon ${RADIUS} m`
        canvas.setAttribute('aria-label', `Joueur en ${Math.floor(position.x)}, ${Math.floor(position.y)}, direction ${
            {up: 'nord', down: 'sud', left: 'ouest', right: 'est'}[direction]}. Nord et départ indiqués sur le radar.`)
    }

    return { element, update, dispose() {
        disposed = true
        samples.clear()
        toggle.removeEventListener('click', onToggle)
        element.remove()
    } }
}
