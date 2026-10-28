/**
 * Son du château, entièrement synthétisé (Web Audio) : aucun fichier ni extrait des jeux.
 * Le thème chiptune (castleMusic.ts) change d'arrangement à chaque étage ; dessous, un léger vent et de rares bruits
 * lointains (cloche, craquement, gouttes). Pas, escaliers, portes et objets passent par une réverbération de grande salle.
 */
import type { CastleEvent, CastleState, ItemKind, RoomStyle, Tile } from './castleLayout'
import { roomAt } from './castleLayout'
import type { Arrangement, MusicEvent } from './castleMusic'
import { arrangementFor, PHRASE_LENGTH, renderSection } from './castleMusic'

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

    // Fond : vent léger et bruits lointains, sous la musique.
    const ambience = context.createGain()
    ambience.gain.value = 0
    ambience.connect(master)
    const ambienceEcho = context.createGain()
    ambienceEcho.gain.value = 0.3
    ambience.connect(ambienceEcho).connect(reverb)

    // Musique : un peu d'écho de salle, et un écho rythmique (à la croche pointée) sur la mélodie.
    const music = context.createGain()
    music.gain.value = 0
    music.connect(master)
    const musicRoom = context.createGain()
    musicRoom.gain.value = 0.18
    music.connect(musicRoom).connect(reverb)
    const lead = context.createBiquadFilter()
    lead.type = 'lowpass'
    lead.frequency.value = 2600
    lead.connect(music)
    const echo = context.createDelay(1)
    const feedback = context.createGain(), echoLevel = context.createGain()
    feedback.gain.value = 0.3
    echoLevel.gain.value = 0.28
    lead.connect(echo).connect(echoLevel).connect(music)
    echo.connect(feedback).connect(echo)

    // Vent : souffle filtré dont la hauteur et le volume ondulent.
    const wind = context.createBufferSource()
    wind.buffer = noise
    wind.loop = true
    const windFilter = context.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.frequency.value = 500
    windFilter.Q.value = 0.9
    const windGain = context.createGain()
    windGain.gain.value = 0.035
    wind.connect(windFilter).connect(windGain).connect(ambience)
    const gust = context.createOscillator(), gustDepth = context.createGain()
    gust.frequency.value = 0.11
    gustDepth.gain.value = 260
    gust.connect(gustDepth).connect(windFilter.frequency)
    wind.start()
    gust.start()

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

    /** Note de musique : attaque nette, tenue, petite chute ; jouée un peu plus courte que sa valeur (piqué). */
    function note(type: OscillatorType, frequency: number, at: number, duration: number, volume: number, output: AudioNode) {
        const source = context.createOscillator(), gain = context.createGain()
        source.type = type
        source.frequency.value = frequency
        const end = at + duration * 0.85
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(volume, at + 0.005)
        gain.gain.setValueAtTime(volume * 0.7, end - 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.03)
        source.connect(gain).connect(output)
        source.start(at)
        source.stop(end + 0.05)
    }

    /** Batterie 8 bits : grosse caisse en sinus qui chute, caisse claire et charleston en souffle filtré. */
    function drum(voice: 'kick' | 'snare' | 'hat', at: number) {
        if (voice === 'kick') return tone('sine', 140, 45, at, 0.12, 0.45, music)
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain()
        source.buffer = noise
        filter.type = voice === 'hat' ? 'highpass' : 'bandpass'
        filter.frequency.value = voice === 'hat' ? 7000 : 1800
        const volume = voice === 'hat' ? 0.05 : 0.18, duration = voice === 'hat' ? 0.03 : 0.1
        gain.gain.setValueAtTime(volume, at)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
        source.connect(filter).connect(gain).connect(music)
        source.start(at, Math.random() * 3)
        source.stop(at + duration + 0.02)
        if (voice === 'snare') tone('triangle', 190, 140, at, 0.06, 0.12, music)
    }

    return {context, master, ambience, music, lead, echo, tone, hiss, creak, note, drum}
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
    let nextAmbient = 0
    // Séquenceur : arrangement en cours, phrase suivante, passages déjà joués, heure de début de la prochaine phrase.
    let arrangement: Arrangement | null = null
    let section = 0, pass = 0, nextSection = 0

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
        engine.music.gain.setTargetAtTime(target * 0.55, engine.context.currentTime, target ? 0.6 : 0.25)
        // Au retour (entrée, fin de combat), le morceau reprend au début de l'arrangement.
        if (target) {
            arrangement = null
            nextSection = engine.context.currentTime + 0.4
        }
    }

    /** Programme la phrase suivante dès qu'elle approche ; l'arrangement suit l'étage, au début d'une phrase. */
    function schedule(sound: Engine, tile: Tile) {
        const now = sound.context.currentTime
        if (nextSection < now) nextSection = now + 0.05
        if (nextSection > now + 0.3) return
        const wanted = arrangementFor(tile)
        if (wanted !== arrangement) {
            arrangement = wanted
            section = 0
            pass = 0
        }
        const sixteenth = 60 / arrangement.tempo / 4
        sound.echo.delayTime.setValueAtTime(sixteenth * 3, nextSection)
        renderSection(arrangement, pass, section).forEach((event) => play(sound, event, nextSection, sixteenth))
        nextSection += PHRASE_LENGTH * sixteenth
        section = (section + 1) % arrangement.sections.length
        if (section === 0) pass++
    }

    function play(sound: Engine, event: MusicEvent, start: number, sixteenth: number) {
        const at = start + event.at * sixteenth
        if (event.voice === 'kick' || event.voice === 'snare' || event.voice === 'hat') return sound.drum(event.voice, at)
        if (event.pitch === null) return
        const frequency = 440 * Math.pow(2, (event.pitch - 69) / 12)
        if (event.voice === 'lead') sound.note('square', frequency, at, event.length * sixteenth, 0.07, sound.lead)
        else sound.note('triangle', frequency, at, event.length * sixteenth, 0.3, sound.music)
    }

    function step(sound: Engine, surface: RoomStyle, at: number, pitch = 1) {
        const {hiss, q, thump, volume} = STEP_SOUND[surface]
        sound.hiss(hiss * pitch, q, at, 0.09, volume)
        sound.tone('sine', thump * pitch, thump * pitch * 0.5, at, 0.12, volume * 1.4)
    }

    /** Bruit lointain au hasard, discret sous la musique : cloche, plancher qui craque ou gouttes d'eau. */
    function ambientEvent(sound: Engine) {
        const at = sound.context.currentTime + 0.05
        const roll = Math.random()
        if (roll < 0.35) {
            const base = 90 + Math.random() * 40
            for (const [ratio, volume] of [[1, 0.03], [2.76, 0.018], [5.4, 0.008]]) sound.tone('sine', base * ratio, base * ratio * 0.98, at, 4.5, volume)
        } else if (roll < 0.65) sound.creak(at, 0.8 + Math.random() * 0.8, 0.035)
        else for (let drop = 0; drop < 3; drop++) sound.tone('sine', 1900, 1100, at + drop * (0.6 + Math.random()), 0.06, 0.03)
    }

    return {
        /** Sous un geste du joueur (touche) : débloque le son si le navigateur l'avait suspendu. */
        resume: () => { if (active) ready() },
        /** Entrée par la grande porte : le lourd battant se referme, la musique démarre. */
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
                    return
                case 'hollow':
                    // Deux coups sourds qui résonnent : le mur est creux.
                    for (const delay of [0, 0.22]) sound.tone('sine', 95, 60, at + delay, 0.25, 0.45)
                    return
                case 'secret':
                    // Le bloc de pierre racle en s'enfonçant, puis se cale.
                    sound.hiss(180, 0.8, at, 1.6, 0.35, 0.2)
                    sound.tone('sawtooth', 48, 40, at, 1.6, 0.06)
                    sound.tone('sine', 70, 30, at + 1.55, 0.5, 0.6)
                    return
                case 'altar':
                    sound.tone('sine', 440, 438, at, 1.5, 0.05)
                    return
                case 'riddle':
                    for (const [index, note] of [523, 659, 784, 1047, 1319].entries()) sound.tone('sine', note, note, at + index * 0.12, 1.4, 0.1)
                    PICKUP_NOTES.key.forEach((note, index) => sound.tone('triangle', note, note, at + 0.7 + index * 0.08, 0.5, 0.12))
            }
        },
        /** Début de combat (spectre ou Mewtwo) : coup sourd et arpège montant 8 bits, sous la transition manga. */
        challenge() {
            const sound = ready()
            if (!sound) return
            const at = sound.context.currentTime + 0.01
            sound.tone('sine', 90, 40, at, 0.5, 0.6)
            ;[62, 65, 69, 74, 77, 81].forEach((pitch, index) =>
                sound.note('square', 440 * Math.pow(2, (pitch - 69) / 12), at + index * 0.07, 0.12, 0.08, sound.lead))
        },
        /** À chaque image : la musique de l'étage et de rares bruits lointains ; coupés pendant un combat. */
        update(state: CastleState | null, battling: boolean) {
            if (paused !== battling) {
                paused = battling
                fadeAmbience()
            }
            if (!engine || !state || !active || paused || engine.context.state !== 'running') return
            schedule(engine, state)
            const now = engine.context.currentTime
            if (now >= nextAmbient) {
                ambientEvent(engine)
                nextAmbient = now + 14 + Math.random() * 12
            }
        },
        /** Onglet masqué : silence total ; il reprend au retour. */
        setHidden(hidden: boolean) {
            if (!engine) return
            void (hidden ? engine.context.suspend() : engine.context.resume()).catch(() => {})
        },
    }
}
