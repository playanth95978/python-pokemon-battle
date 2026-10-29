import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVillageAudio } from './villageAudio'
import { createVillageAudioControls } from './villageAudioControls'
import type { VillageAudioFrame } from './villageSoundscape'
import type { WorldMap } from '../world/types'

let audio: ReturnType<typeof createVillageAudio> | undefined
afterEach(() => { audio?.dispose(); audio = undefined; vi.unstubAllGlobals(); document.body.replaceChildren() })

function installAudio() {
    const param = () => ({value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn()})
    const node = () => ({connect: vi.fn((target: unknown) => target), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
        gain: param(), frequency: param(), Q: param(), ratio: param(), threshold: param(),
        positionX: param(), positionY: param(), positionZ: param(), buffer: null, loop: false, onended: null})
    const sources: ReturnType<typeof node>[] = [], panners: ReturnType<typeof node>[] = []
    const context = {
        state: 'running', currentTime: 10, sampleRate: 64, destination: node(),
        listener: Object.fromEntries(['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'].map((key) => [key, param()])),
        createGain: vi.fn(node), createDynamicsCompressor: vi.fn(node), createBiquadFilter: vi.fn(node),
        createPanner: vi.fn(() => { const result = node(); panners.push(result); return result }),
        createBufferSource: vi.fn(() => { const result = node(); sources.push(result); return result }),
        createBuffer: vi.fn((_channels: number, length: number) => ({getChannelData: () => new Float32Array(length)})),
        resume: vi.fn(async () => { context.state = 'running' }), suspend: vi.fn(async () => { context.state = 'suspended' }),
        close: vi.fn().mockResolvedValue(undefined), decodeAudioData: vi.fn().mockResolvedValue({}),
    }
    const constructor = vi.fn(function() { return context })
    vi.stubGlobal('AudioContext', constructor)
    return {context, sources, panners, constructor}
}

const map: WorldMap = {width: 16, height: 8, tileSize: 32, buildings: [], landmarks: [], props: [{x: 3, y: 3, kind: 'fountain'}],
    tiles: Array.from({length: 128}, (_, index) => index % 16 < 8 ? 'tree' : 'water')}
const frame = (): VillageAudioFrame => ({listener: {x: 7, y: 0, z: 4}, forward: {x: 0, y: 0, z: -1}, villagers: [], pokemon: [], extraPokemon: [], rain: 0})
const offline = () => vi.fn().mockRejectedValue(new TypeError('offline'))

describe('Ambiance spatialisée de Clairbois', () => {
    it('reste silencieuse et sans contexte audio jusqu’à une activation explicite', () => {
        const {constructor, context} = installAudio()
        const fetcher = offline()
        audio = createVillageAudio(map, {random: () => 0.5, fetcher})
        audio.update(frame())
        expect(constructor).not.toHaveBeenCalled()
        expect(fetcher).not.toHaveBeenCalled()
        audio.toggle(); audio.update(frame())
        expect(constructor).toHaveBeenCalledOnce()
        expect(context.createPanner).toHaveBeenCalled()
    })

    it('suit la position et le regard du joueur, puis libère les sources trop éloignées', () => {
        const {context, panners, sources} = installAudio()
        audio = createVillageAudio(map, {random: () => 0.5, fetcher: offline()})
        audio.toggle(); audio.update(frame())
        expect(context.listener.positionX.setTargetAtTime).toHaveBeenCalledWith(7, 10, 0.05)
        expect(panners[0].positionX.setTargetAtTime).toHaveBeenCalled()
        context.currentTime = 11
        audio.update({...frame(), listener: {x: 1000, y: 0, z: 1000}, forward: {x: 1, y: 0, z: 0}})
        expect(context.listener.forwardX.setTargetAtTime).toHaveBeenLastCalledWith(1, 11, 0.05)
        expect(sources.every((source) => source.stop.mock.calls.length > 0)).toBe(true)
    })

    it('borne les sons simultanés et ne recalcule pas les positions à chaque image', () => {
        const {context, sources} = installAudio()
        audio = createVillageAudio(map, {random: () => 0.5, fetcher: offline()})
        audio.toggle(); audio.update(frame())
        const panCalls = context.listener.positionX.setTargetAtTime.mock.calls.length
        context.currentTime = 10.01; audio.update(frame())
        expect(context.listener.positionX.setTargetAtTime.mock.calls.length).toBe(panCalls)
        for (let index = 0; index < 20; index++) audio.say({id: 'neighbour', x: 7, y: 4, kind: 'voice', radius: 10, level: 0.2})
        expect(sources.filter((source) => source.loop)).toHaveLength(3)
        expect(sources.filter((source) => !source.loop)).toHaveLength(4)
    })

    it('se tait pendant les menus, combats et onglets masqués, puis respecte le réglage du volume', () => {
        const {context, sources} = installAudio()
        audio = createVillageAudio(map, {random: () => 0.5, fetcher: offline()})
        audio.toggle(); audio.update(frame()); audio.setActive(false)
        expect(context.suspend).toHaveBeenCalled()
        expect(sources.every((source) => source.disconnect.mock.calls.length > 0)).toBe(true)
        const count = sources.length
        audio.setHidden(true); audio.setActive(true); audio.update(frame())
        expect(sources).toHaveLength(count)
        audio.setHidden(false); context.currentTime = 12; audio.update(frame())
        expect(sources.length).toBeGreaterThan(count)
        audio.setVolume(0)
        expect(context.state).toBe('suspended')
        audio.setVolume(0.3)
        expect(audio.volume).toBe(0.3)
        audio.dispose()
        expect(context.close).toHaveBeenCalledOnce()
    })

    it('garde un contrôle audio indépendant du HUD et gère un navigateur sans Web Audio', () => {
        vi.stubGlobal('AudioContext', undefined)
        audio = createVillageAudio(map, {fetcher: offline()})
        const controls = createVillageAudioControls(document.body, audio)
        expect(controls.element.querySelector('button')).toBeDisabled()
        expect(controls.element).toHaveTextContent('Audio indisponible')
        audio.toggle()
        expect(audio.enabled).toBe(false)
        controls.dispose()
    })
})
