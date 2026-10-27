import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { createMinimap } from './minimap'
import type { WorldGenerator } from './worldGenerator'

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

describe('Mini-carte du monde ouvert', () => {
    it('lit les coordonnées réelles, limite les échantillons au voisinage et réutilise son cache', () => {
        const context = {
            createImageData: (width: number, height: number) => ({data: new Uint8ClampedArray(width * height * 4)}),
            putImageData: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
            fill: vi.fn(), save: vi.fn(), clip: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(),
            restore: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
        }
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
        // Horloge fixe : laisser remplir tout le petit radar pour mesurer précisément son cache.
        vi.spyOn(performance, 'now').mockReturnValue(0)
        const sample = vi.fn(() => ({height: 10, moisture: 0, temperature: 0, biome: 'plains' as const}))
        const world = {seed: 42, sample} as unknown as WorldGenerator
        const radar = createMinimap(world, {x: 5000.5, y: 5000.5})
        document.body.appendChild(radar.element)
        radar.update(0, {x: 5000.5, y: 5000.5}, 'up', 0)
        expect(radar.element.textContent).toContain('5000, 5000')
        const count = sample.mock.calls.length
        expect(count).toBeGreaterThan(0)
        expect(count).toBeLessThan(6000)
        radar.update(200, {x: 5000.5, y: 5000.5}, 'left', 1)
        expect(sample).toHaveBeenCalledTimes(count)
        expect(radar.element.querySelector('canvas')).toHaveAttribute('aria-label', expect.stringContaining('ouest'))
        const button = radar.element.querySelector('button')!
        fireEvent.click(button)
        expect(button).toHaveAttribute('aria-expanded', 'false')
        radar.update(400, {x: 5016.5, y: 5000.5}, 'right', 0)
        expect(sample).toHaveBeenCalledTimes(count)
        fireEvent.click(button)
        radar.update(600, {x: 5016.5, y: 5000.5}, 'right', 0)
        expect(radar.element.textContent).toContain('5016, 5000')
        expect(sample.mock.calls.length).toBeGreaterThan(count)
        radar.dispose()
        expect(document.querySelector('.open-world-radar')).toBeNull()
    })

    it('garde la page utilisable lorsque Canvas 2D est indisponible', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
        const radar = createMinimap({} as WorldGenerator, {x: 0, y: 0})
        expect(() => radar.update(0, {x: 0, y: 0}, 'up', 0)).not.toThrow()
        expect(radar.element.textContent).toContain('indisponible')
        radar.dispose()
    })
})
