/**
 * Ambiance sonore du château, entièrement synthétisée (Web Audio) : aucun fichier ni extrait des jeux.
 * Une nappe grave et dissonante, du vent dans les couloirs et des bruits lointains (cloche, craquements, gouttes)
 * dont la tension monte d'étage en étage jusqu'au battement de cœur devant Mewtwo ; pas, escaliers, portes et objets
 * passent par une réverbération de grande salle.
 */
import type { CastleEvent, CastleState, ItemKind, RoomStyle, Tile } from './castleLayout'
import { BOSS, roomAt } from './castleLayout'

/** Tension de 0 à 1 : calme inquiet au rez-de-chaussée, oppressante au sommet, maximale tout près de Mewtwo. */
export function tensionAt(tile: Tile) {
    if (tile.floor === 0) return 0.2
    if (tile.floor === 1) return 0.45
    if (roomAt(tile)?.id !== 'throne') return 0.7
    const distance = Math.hypot(tile.x - (BOSS.x + (BOSS.width - 1) / 2), tile.z - BOSS.z)
    return 0.8 + 0.2 * (1 - Math.min(1, distance / 12))
}

/** Écart entre deux battements de cœur, en secondes ; aucun battement tant que la tension reste modérée. */
export function heartbeatInterval(tension: number) {
    return tension < 0.6 ? null : 1.3 - (tension - 0.6) * 1.5
}

export function surfaceAt(tile: Tile): RoomStyle {
    return roomAt(tile)?.style ?? 'stone'
}

/** Souffle rejouable en boucle (vent, chuchotements, frottements). */
function noiseBuffer(context: AudioContext, seconds: number) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1
    return buffer
}

/** Réponse impulsionnelle d'une grande salle de pierre : un bruit qui s'éteint en quelques secondes. */
function hallImpulse(context: AudioContext, seconds: number) {
    const length = Math.ceil(context.sampleRate * seconds)
    const buffer = context.createBuffer(2, length, context.sampleRate)
    for (let channel = 0; channel < 2; channel++) {
        const samples = buffer.getChannelData(channel)
        for (let index = 0; index < length; index++) samples[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 3)
    }
    return buffer
}

function createEngine() {
    const context = new AudioContext()
    const master = context.createGain()
    master.gain.value = 0.6
    master.connect(context.destination)
    const reverb = context.createConvolver()
    reverb.buffer = hallImpulse(context, 3.2)
    const wet = context.createGain()
    wet.gain.value = 0.45
    reverb.connect(wet).connect(master)
    // Bruitages : un peu de son direct, beaucoup d'écho.
    const effects = context.createGain()
    effects.connect(master)
    effects.connect(reverb)
    const noise = noiseBuffer(context, 4)

    // Nappe : deux scies graves légèrement désaccordées et un triton, sous un filtre qui respire lentement.
    const ambience = context.createGain()
    ambience.gain.value = 0
    ambience.connect(master)
    const ambienceEcho = context.createGain()
    ambienceEcho.gain.value = 0.3
    ambience.connect(ambienceEcho).connect(reverb)
    const droneFilter = context.createBiquadFilter()
    droneFilter.type = 'lowpass'
    droneFilter.Q.value = 5
    droneFilter.frequency.value = 180
    const droneGain = context.createGain()
    droneGain.gain.value = 0.2
    droneFilter.connect(droneGain).connect(ambience)
    for (const [type, frequency] of [['sawtooth', 55], ['sawtooth', 55.4], ['triangle', 77.8]] as const) {
        const oscillator = context.createOscillator()
        oscillator.type = type
        oscillator.frequency.value = frequency
        oscillator.connect(droneFilter)
        oscillator.start()
    }
    const breath = context.createOscillator(), breathDepth = context.createGain()
    breath.frequency.value = 0.07
    breathDepth.gain.value = 70
    breath.connect(breathDepth).connect(droneFilter.frequency)
    breath.start()

    // Vent : souffle filtré dont la hauteur et le volume ondulent.
    const wind = context.createBufferSource()
    wind.buffer = noise
    wind.loop = true
    const windFilter = context.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.frequency.value = 500
    windFilter.Q.value = 0.9
    const windGain = context.createGain()
    windGain.gain.value = 0.07
    wind.connect(windFilter).connect(windGain).connect(ambience)
    const gust = context.createOscillator(), gustDepth = context.createGain()
    gust.frequency.value = 0.11
    gustDepth.gain.value = 260
    gust.connect(gustDepth).connect(windFilter.frequency)
    wind.start()
    gust.start()

    // Accord dissonant aigu (si bémol, si, fa) : absent en bas, il s'installe vers le sommet.
    const pad = context.createGain()
    pad.gain.value = 0
    pad.connect(ambience)
    for (const frequency of [233.1, 246.9, 349.2]) {
        const oscillator = context.createOscillator()
        oscillator.frequency.value = frequency
        oscillator.connect(pad)
        oscillator.start()
    }

    function tone(type: OscillatorType, frequency: number, end: number, at: number, duration: number, volume: number, output: AudioNode = effects) {
        const source = context.createOscillator(), gain = context.createGain()
        source.type = type
        source.frequency.setValueAtTime(frequency, at)
        source.frequency.exponentialRampToValueAtTime(end, at + duration)
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(volume, at + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
        source.connect(gain).connect(output)
        source.start(at)
        source.stop(at + duration + 0.05)
    }

    function hiss(frequency: number, q: number, at: number, duration: number, volume: number, attack = 0.005) {
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain()
        source.buffer = noise
        filter.type = 'bandpass'
        filter.frequency.value = frequency
        filter.Q.value = q
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(volume, at + attack)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
        source.connect(filter).connect(gain).connect(effects)
        source.start(at, Math.random() * 3)
        source.stop(at + duration + 0.05)
    }

    /** Grincement : une scie grave dont la hauteur tremble, filtrée comme du bois qui travaille. */
    function creak(at: number, duration: number, volume: number) {
        const source = context.createOscillator(), filter = context.createBiquadFilter(), gain = context.createGain()
        source.type = 'sawtooth'
        source.frequency.setValueAtTime(70, at)
        for (let t = 0; t < duration; t += 0.06) source.frequency.linearRampToValueAtTime(60 + Math.random() * 60, at + t)
        filter.type = 'bandpass'
        filter.frequency.value = 750
        filter.Q.value = 9
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(volume, at + 0.15)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
        source.connect(filter).connect(gain).connect(effects)
        source.start(at)
        source.stop(at + duration + 0.05)
    }

    return {context, master, ambience, droneFilter, pad, tone, hiss, creak}
}

type Engine = ReturnType<typeof createEngine>

const STEP_SOUND: Record<RoomStyle, { hiss: number; q: number; thump: number; volume: number }> = {
    stone: {hiss: 900, q: 1.2, thump: 110, volume: 0.22},
    wood: {hiss: 420, q: 1.5, thump: 150, volume: 0.26},
    marble: {hiss: 2600, q: 2.5, thump: 190, volume: 0.16},
}
const PICKUP_NOTES: Record<ItemKind, number[]> = {
    potion: [523, 659, 784], candy: [659, 784, 1047], stone: [392, 523, 659], ball: [523, 784, 1047, 1568], key: [988, 1319, 1976],
}

export function createCastleAudio() {
    let engine: Engine | null = null
    let active = false, paused = false, muted = false
    let nextAmbient = 0, nextBeat = 0

    /** Le contexte audio naît au premier geste du joueur (règle des navigateurs sur la lecture automatique). */
    function ready() {
        engine ??= createEngine()
        if (engine.context.state === 'suspended' && !document.hidden) void engine.context.resume().catch(() => {})
        return engine.context.state === 'running' ? engine : null
    }

    function fadeAmbience() {
        if (!engine) return
        const target = active && !paused ? 1 : 0
        engine.ambience.gain.setTargetAtTime(target, engine.context.currentTime, target ? 1.2 : 0.4)
    }

    function step(sound: Engine, surface: RoomStyle, at: number, pitch = 1) {
        const {hiss, q, thump, volume} = STEP_SOUND[surface]
        sound.hiss(hiss * pitch, q, at, 0.09, volume)
        sound.tone('sine', thump * pitch, thump * pitch * 0.5, at, 0.12, volume * 1.4)
    }

    /** Bruit lointain au hasard : cloche fêlée, plancher qui craque, goutte d'eau ou chuchotement. */
    function ambientEvent(sound: Engine, tension: number) {
        const at = sound.context.currentTime + 0.05
        const roll = Math.random()
        if (roll < 0.3) {
            const base = 90 + Math.random() * 40
            for (const [ratio, volume] of [[1, 0.05], [2.76, 0.03], [5.4, 0.015]]) sound.tone('sine', base * ratio, base * ratio * 0.98, at, 4.5, volume)
        } else if (roll < 0.55) sound.creak(at, 0.8 + Math.random() * 0.8, 0.05)
        else if (roll < 0.8) {
            for (let drop = 0; drop < 3; drop++) sound.tone('sine', 1900, 1100, at + drop * (0.6 + Math.random()), 0.06, 0.035)
        } else sound.hiss(1800 + Math.random() * 800, 12, at, 2.2, 0.04 + tension * 0.04, 1)
    }

    return {
        /** Sous un geste du joueur (touche) : débloque le son si le navigateur l'avait suspendu. */
        resume: () => { if (active) ready() },
        /** Entrée par la grande porte : le lourd battant se referme, la nappe monte. */
        enter() {
            active = true
            const sound = ready()
            fadeAmbience()
            if (!sound) return
            const at = sound.context.currentTime + 0.05
            sound.creak(at, 1.1, 0.07)
            sound.tone('sine', 70, 30, at + 1, 0.9, 0.5)
            sound.hiss(300, 1, at + 1, 0.6, 0.2)
            nextAmbient = at + 5
        },
        leave() {
            active = false
            fadeAmbience()
        },
        toggleMute() {
            muted = !muted
            if (engine) engine.master.gain.setTargetAtTime(muted ? 0 : 0.6, engine.context.currentTime, 0.05)
            return muted
        },
        get muted() {
            return muted
        },
        /** Bruitage d'un pas dans le château, selon son résultat. */
        play(event: CastleEvent, state: CastleState) {
            const sound = ready()
            if (!sound || !active) return
            const at = sound.context.currentTime + 0.01
            switch (event.type) {
                case 'moved':
                    return step(sound, surfaceAt(state), at)
                case 'pickup':
                    step(sound, surfaceAt(state), at)
                    PICKUP_NOTES[event.item.kind].forEach((note, index) =>
                        sound.tone(event.item.kind === 'key' ? 'triangle' : 'sine', note, note, at + 0.05 + index * 0.08, 0.5, 0.12))
                    return
                case 'stairs':
                    // Cinq marches de pierre qui montent (ou descendent) dans la cage d'escalier.
                    for (let index = 0; index < 5; index++) {
                        step(sound, 'stone', at + index * 0.17, event.stairs.up ? 1 + index * 0.08 : 1.3 - index * 0.08)
                    }
                    sound.hiss(400, 0.7, at, 0.9, 0.05, 0.3)
                    return
                case 'unlocked':
                    sound.tone('square', 1250, 1180, at, 0.08, 0.06)
                    sound.tone('square', 1850, 1800, at + 0.07, 0.1, 0.05)
                    sound.tone('sine', 140, 60, at + 0.07, 0.2, 0.3)
                    sound.creak(at + 0.25, 1.3, 0.08)
                    return
                case 'locked':
                    for (const delay of [0, 0.08, 0.19]) {
                        sound.hiss(2100, 5, at + delay, 0.05, 0.18)
                        sound.tone('sine', 120, 70, at + delay, 0.08, 0.2)
                    }
                    return
                case 'exit':
                    sound.creak(at, 1, 0.07)
            }
        },
        /** Le défi de Mewtwo : coup sourd et accord strident, sous la transition manga. */
        challenge() {
            const sound = ready()
            if (!sound) return
            const at = sound.context.currentTime + 0.01
            sound.tone('sine', 65, 25, at, 1.4, 0.8)
            for (const frequency of [466, 494, 698, 740]) sound.tone('sawtooth', frequency, frequency * 0.97, at, 1.5, 0.05)
            sound.hiss(900, 0.6, at, 1.2, 0.25)
        },
        /** À chaque image : tension de la pièce, bruits lointains, battement de cœur ; coupé pendant un combat. */
        update(state: CastleState | null, battling: boolean) {
            if (paused !== battling) {
                paused = battling
                fadeAmbience()
            }
            if (!engine || !state || !active || paused || engine.context.state !== 'running') return
            const sound = engine, now = sound.context.currentTime
            const tension = tensionAt(state)
            sound.droneFilter.frequency.setTargetAtTime(140 + tension * 300, now, 1.5)
            sound.pad.gain.setTargetAtTime(Math.max(0, tension - 0.4) * 0.05, now, 2)
            if (now >= nextAmbient) {
                ambientEvent(sound, tension)
                nextAmbient = now + (9 - tension * 4) + Math.random() * 8
            }
            const beat = heartbeatInterval(tension)
            if (beat !== null && now >= nextBeat) {
                sound.tone('sine', 58, 38, now + 0.02, 0.18, 0.35 + tension * 0.2)
                sound.tone('sine', 52, 34, now + 0.24, 0.16, 0.25 + tension * 0.15)
                nextBeat = now + beat
            }
        },
        /** Onglet masqué : silence total ; il reprend au retour. */
        setHidden(hidden: boolean) {
            if (!engine) return
            void (hidden ? engine.context.suspend() : engine.context.resume()).catch(() => {})
        },
    }
}
