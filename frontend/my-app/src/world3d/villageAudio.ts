/** Ambiance extérieure Web Audio : cinq boucles et quatre bruitages au maximum, calculés à 10 Hz. */
import type { WorldMap } from '../world/types'
import { createPokemonCries } from './pokemonCries'
import { actorEmitters, ambientNear, environmentEmitters, MAX_SHORT_SOUNDS, proximity } from './villageSoundscape'
import type { SoundEmitter, SoundKind, VillageAudioFrame } from './villageSoundscape'

interface Voice { source: AudioBufferSourceNode; gain: GainNode; panner: PannerNode; filter?: BiquadFilterNode; emitter: SoundEmitter }
interface Options { random?: () => number; fetcher?: typeof fetch }

export function createVillageAudio(map: WorldMap, {random = Math.random, fetcher = fetch}: Options = {}) {
    const environment = environmentEmitters(map)
    let context: AudioContext | null = null, master: GainNode | null = null, compressor: DynamicsCompressorNode | null = null
    let cries: ReturnType<typeof createPokemonCries> | null = null
    let enabled = false, active = true, hidden = document.hidden, disposed = false, failed = false, volume = 0.45
    let previousTick = -Infinity, nextCry = 0, nextVoice = 0, nextBranch = 0, nextHammer = 0
    let frame: VillageAudioFrame | null = null
    const loops = new Map<string, Voice>(), shots = new Set<Voice>(), buffers = new Map<string, AudioBuffer>()
    const cooldowns = new Map<string, number>(), changed = new Set<() => void>()
    const notify = () => changed.forEach((callback) => callback())
    const playing = () => enabled && active && !hidden && !disposed && !failed && volume > 0

    function release(voice: Voice) {
        voice.source.onended = null
        voice.source.stop()
        voice.source.disconnect(); voice.gain.disconnect(); voice.panner.disconnect(); voice.filter?.disconnect()
        shots.delete(voice)
    }
    function stop() { loops.forEach(release); loops.clear(); [...shots].forEach(release) }

    function initialize() {
        if (context || disposed || failed) return
        if (typeof AudioContext === 'undefined') { failed = true; return }
        context = new AudioContext()
        master = context.createGain()
        master.gain.value = volume
        compressor = context.createDynamicsCompressor()
        compressor.threshold.value = -18; compressor.ratio.value = 4
        master.connect(compressor).connect(context.destination)
        cries = createPokemonCries(context, fetcher)
    }

    function synchronize() {
        if (!playing()) stop()
        if (!context) { notify(); return }
        master!.gain.setTargetAtTime(playing() ? volume : 0, context.currentTime, 0.04)
        const operation = playing() ? context.resume() : context.suspend()
        void operation.then(notify).catch(() => { failed = true; stop(); notify() })
        previousTick = -Infinity
        notify()
    }

    /** Sons courts en mémoire, réutilisés : syllabes sans mots, impacts, branches et cris de repli. */
    function buffer(kind: SoundKind, species = '') {
        const key = `${kind}-${species}`
        if (buffers.has(key)) return buffers.get(key)!
        const looping = ['water', 'fountain', 'leaves'].includes(kind)
        const duration = looping ? 4 : kind === 'hammer' ? 0.28 : kind === 'branch' ? 0.32 : 0.8
        const result = context!.createBuffer(1, Math.ceil(context!.sampleRate * duration), context!.sampleRate)
        const data = result.getChannelData(0)
        const base = kind === 'child' ? 235 : kind === 'cry' ? ({pikachu: 850, charmander: 320, mareep: 460, pidgey: 1200, snorlax: 90}[species] ?? 380) : 125 + random() * 45
        let brown = 0
        for (let index = 0; index < data.length; index++) {
            const t = index / context!.sampleRate, noise = random() * 2 - 1
            if (looping) { brown = (brown + noise * 0.08) / 1.025; data[index] = kind === 'leaves' ? noise * 0.5 : brown * 3; continue }
            const fade = Math.sin(Math.PI * t / duration) ** 2
            if (kind === 'hammer') data[index] = (noise * Math.exp(-t * 65) + Math.sin(t * 7600) * Math.exp(-t * 18) * 0.4) * Math.min(1, t * 1000)
            else if (kind === 'branch') data[index] = noise * (Math.exp(-t * 65) + (t > 0.12 ? Math.exp(-(t - 0.12) * 90) * 0.6 : 0))
            else if (kind === 'cry') data[index] = Math.sin(2 * Math.PI * base * (t + 0.08 * Math.sin(t * 8)) + 2 * Math.sin(t * base * 3)) * fade * 0.55
            else {
                const syllable = Math.max(0, Math.sin(t * 26)) ** 2
                const carrier = Math.sin(2 * Math.PI * base * t + Math.sin(t * 15))
                data[index] = carrier * (0.6 + 0.4 * Math.sin(t * 2100)) * syllable * fade * 0.6
            }
        }
        buffers.set(key, result)
        return result
    }

    function pan(voice: Voice, emitter: SoundEmitter) {
        const at = context!.currentTime
        voice.emitter = emitter
        voice.panner.positionX.setTargetAtTime(emitter.x + 0.5, at, 0.06)
        voice.panner.positionY.setTargetAtTime(emitter.kind === 'leaves' ? 3 : 0.8, at, 0.06)
        voice.panner.positionZ.setTargetAtTime(emitter.y + 0.5, at, 0.06)
        const gust = emitter.kind === 'leaves' ? 0.8 + 0.2 * Math.sin(at * 0.7 + emitter.x) : 1
        voice.gain.gain.setTargetAtTime(emitter.level * proximity(emitter, frame!.listener) * gust, at, voice.source.loop ? 0.1 : 0.006)
    }

    function start(emitter: SoundEmitter, loop = false) {
        if (!context || !master || (!loop && shots.size >= MAX_SHORT_SOUNDS)) return
        const source = context.createBufferSource(), gain = context.createGain(), panner = context.createPanner()
        panner.panningModel = 'equalpower'
        // Le gain de proximité est calculé une seule fois et testé dans villageSoundscape.
        panner.rolloffFactor = 0
        source.buffer = emitter.kind === 'cry' ? cries!.get(emitter.species ?? '') ?? buffer('cry', emitter.species) : buffer(emitter.kind)
        source.loop = loop
        const voice: Voice = {source, gain, panner, emitter}
        gain.gain.value = 0
        if (loop) {
            const filter = context.createBiquadFilter()
            filter.type = 'bandpass'; filter.frequency.value = emitter.kind === 'leaves' ? 2600 : emitter.kind === 'fountain' ? 1400 : 620
            filter.Q.value = 0.6
            source.connect(filter).connect(gain)
            voice.filter = filter
        } else source.connect(gain)
        gain.connect(panner).connect(master)
        pan(voice, emitter)
        if (loop) loops.set(emitter.id, voice)
        else {
            shots.add(voice)
            source.onended = () => { source.disconnect(); gain.disconnect(); panner.disconnect(); shots.delete(voice) }
        }
        source.start(context.currentTime, loop ? random() * 3 : 0)
    }

    function scheduled(actors: SoundEmitter[], kind: SoundKind, now: number) {
        const candidate = actors.find((emitter) => emitter.kind === kind && now >= (cooldowns.get(emitter.id) ?? 0))
        if (!candidate) return
        start(candidate)
        cooldowns.set(candidate.id, now + (kind === 'cry' ? 18 : 6) + random() * 10)
    }

    return {
        get enabled() { return enabled }, get volume() { return volume }, get available() { return !failed && typeof AudioContext !== 'undefined' },
        get paused() { return !active || hidden },
        subscribe(callback: () => void) { changed.add(callback); return () => { changed.delete(callback) } },
        /** Appelé uniquement par un geste explicite : bouton ou touche M. */
        toggle() {
            if (disposed) return
            enabled = !enabled
            if (enabled) {
                try { initialize() } catch { failed = true }
                if (failed) enabled = false
            }
            synchronize()
        },
        resume() { if (enabled && playing() && context?.state === 'suspended') synchronize() },
        setVolume(value: number) { if (!Number.isFinite(value)) return; volume = Math.max(0, Math.min(1, value)); synchronize() },
        setActive(value: boolean) { if (active === value) return; active = value; synchronize() },
        setHidden(value: boolean) { if (hidden === value) return; hidden = value; synchronize() },
        say(emitter: SoundEmitter) { if (playing() && context?.state === 'running' && frame && proximity(emitter, frame.listener) > 0) { start(emitter); cooldowns.set(emitter.id, context.currentTime + 8) } },
        update(next: VillageAudioFrame) {
            frame = next
            if (!playing() || !context || context.state !== 'running' || context.currentTime - previousTick < 0.1) return
            const now = context.currentTime
            previousTick = now
            const listener = context.listener
            listener.positionX.setTargetAtTime(next.listener.x, now, 0.05)
            listener.positionY.setTargetAtTime(next.listener.y + 1.3, now, 0.05)
            listener.positionZ.setTargetAtTime(next.listener.z, now, 0.05)
            listener.forwardX.setTargetAtTime(next.forward.x, now, 0.05)
            listener.forwardY.setTargetAtTime(next.forward.y, now, 0.05)
            listener.forwardZ.setTargetAtTime(next.forward.z, now, 0.05)
            listener.upX.setValueAtTime(0, now); listener.upY.setValueAtTime(1, now); listener.upZ.setValueAtTime(0, now)
            const near = ambientNear(environment, next.listener).map((emitter) => ({...emitter,
                level: emitter.level * (1 + Math.max(0, Math.min(1, next.rain)) * (emitter.kind === 'leaves' ? 0.4 : 0.2))}))
            for (const [id, voice] of loops) if (!near.some((emitter) => emitter.id === id)) { release(voice); loops.delete(id) }
            near.forEach((emitter) => { const voice = loops.get(emitter.id); if (voice) pan(voice, emitter); else start(emitter, true) })
            const actors = actorEmitters(next)
            actors.filter((emitter) => emitter.kind === 'cry').slice(0, 3).forEach((emitter) => cries!.get(emitter.species!))
            shots.forEach((voice) => {
                const actor = actors.find((emitter) => emitter.id === voice.emitter.id)
                if ((!actor && voice.emitter.kind !== 'branch') || proximity(actor ?? voice.emitter, next.listener) === 0) release(voice)
                else pan(voice, actor ?? voice.emitter)
            })
            if (now >= nextCry) { scheduled(actors, 'cry', now); nextCry = now + 4 + random() * 3 }
            if (now >= nextVoice) { scheduled(actors, random() > 0.5 ? 'child' : 'voice', now); nextVoice = now + 3 + random() * 4 }
            if (now >= nextHammer) { scheduled(actors, 'hammer', now); nextHammer = now + 1.4 }
            if (now >= nextBranch) {
                const tree = near.find((emitter) => emitter.kind === 'leaves')
                if (tree) start({...tree, id: 'branch', kind: 'branch', level: 0.15})
                nextBranch = now + 8 + random() * 10
            }
        },
        dispose() {
            if (disposed) return
            disposed = true; stop(); cries?.dispose(); buffers.clear(); changed.clear()
            master?.disconnect(); compressor?.disconnect()
            if (context) void context.close().catch(() => {})
        },
    }
}
