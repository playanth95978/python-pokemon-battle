/**
 * Thème du château, composition originale dans l'esprit des châteaux des jeux de plateforme 8 bits : ré mineur,
 * basse qui marche en octaves avec des chromatismes, mélodie piquée et écho. Aucune mélodie existante n'est reprise.
 *
 * Le morceau est découpé en phrases de deux mesures (32 doubles croches). Chaque étage a son arrangement (tempo,
 * tonalité, batterie, ordre des phrases) et chaque passage varie : mélodie à l'octave, pont en arpèges, roulements.
 */
import type { Tile } from './castleLayout'
import { roomAt } from './castleLayout'

/** Hauteur MIDI (ou silence) et durée en doubles croches. */
export type Note = [pitch: number | null, sixteenths: number]
export interface Phrase { lead: Note[]; bass: Note[] }

export const PHRASE_LENGTH = 32

const octaves = (low: number[]): Note[] => low.flatMap((pitch) => [[pitch, 2], [pitch + 12, 2]] as Note[])
const trill = (a: number, b: number, count: number): Note[] => Array.from({length: count}, (_, index) => [index % 2 ? b : a, 1] as Note)

export const PHRASES = {
    // Le motif : une question qui descend vers le la, puis se pose sur le fa.
    A: {
        lead: [[74, 2], [77, 1], [76, 1], [74, 2], [73, 2], [74, 2], [null, 2], [69, 2], [70, 2],
            [72, 2], [70, 1], [69, 1], [67, 2], [69, 2], [65, 4], [null, 4]],
        bass: octaves([38, 38, 38, 37, 34, 34, 33, 33]),
    },
    // La réponse : même début, mais elle remonte jusqu'au la aigu.
    A2: {
        lead: [[74, 2], [77, 1], [76, 1], [74, 2], [73, 2], [74, 2], [null, 2], [69, 2], [70, 2],
            [72, 2], [74, 1], [76, 1], [77, 2], [76, 2], [81, 4], [null, 4]],
        bass: octaves([38, 38, 38, 37, 34, 36, 37, 37]),
    },
    // Le pont : sol mineur, puis la dominante (la majeur) qui ramène au début.
    B: {
        lead: [[79, 3], [77, 1], [75, 2], [74, 2], [75, 2], [77, 2], [79, 4],
            [76, 2], [77, 2], [76, 2], [73, 2], [76, 4], [69, 4]],
        bass: octaves([43, 43, 41, 41, 40, 40, 37, 33]),
    },
    // Le passage tendu : trilles serrés d'un demi-ton, comme une alarme lointaine.
    C: {
        lead: [...trill(74, 75, 16), ...trill(73, 74, 8), [70, 2], [69, 2], [null, 4]],
        bass: octaves([38, 39, 38, 39, 37, 37, 33, 33]),
    },
    // Respiration : arpèges de ré mineur et de si bémol, la mélodie se tait.
    D: {
        lead: [62, 65, 69, 74, 69, 65, 62, 65, 58, 62, 65, 70, 65, 62, 58, 62].map((pitch) => [pitch, 2] as Note),
        bass: [[38, 8], [38, 8], [34, 8], [33, 8]],
    },
} satisfies Record<string, Phrase>

export type PhraseName = keyof typeof PHRASES
export type Drums = 'soft' | 'march' | 'full'

export interface Arrangement {
    name: string
    /** Noires par minute. */
    tempo: number
    transpose: number
    drums: Drums
    sections: PhraseName[]
}

/** Chaque étage a sa couleur : discret en bas, plus enlevé au premier, héroïque au sommet. */
export const ARRANGEMENTS: Record<'ground' | 'upper' | 'summit' | 'throne', Arrangement> = {
    ground: {name: 'ground', tempo: 112, transpose: 0, drums: 'soft', sections: ['A', 'A2', 'D', 'B', 'A2']},
    upper: {name: 'upper', tempo: 124, transpose: 2, drums: 'march', sections: ['A', 'B', 'A2', 'D', 'C', 'A2']},
    summit: {name: 'summit', tempo: 132, transpose: 0, drums: 'march', sections: ['C', 'A2', 'B', 'C']},
    throne: {name: 'throne', tempo: 138, transpose: 3, drums: 'full', sections: ['C', 'A', 'B', 'C', 'A2']},
}

export function arrangementFor(tile: Tile): Arrangement {
    if (tile.floor === 0) return ARRANGEMENTS.ground
    if (tile.floor === 1) return ARRANGEMENTS.upper
    return roomAt(tile)?.id === 'throne' ? ARRANGEMENTS.throne : ARRANGEMENTS.summit
}

export type Voice = 'lead' | 'bass' | 'kick' | 'snare' | 'hat'
export interface MusicEvent { at: number; voice: Voice; pitch: number | null; length: number }

const DRUM_STEPS: Record<Drums, Partial<Record<'kick' | 'snare' | 'hat', number[]>>> = {
    soft: {hat: [0, 4, 8, 12], kick: [0]},
    march: {kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14]},
    full: {kick: [0, 6, 8, 14], snare: [4, 12], hat: Array.from({length: 16}, (_, step) => step)},
}

/**
 * Les notes d'une phrase de l'arrangement, en doubles croches depuis son début. `pass` compte les passages déjà
 * joués : la mélodie monte d'une octave un passage sur deux, un passage sur trois remplace la première phrase par les
 * arpèges, et la dernière mesure d'un passage sur quatre se termine par un roulement de caisse claire.
 */
export function renderSection(arrangement: Arrangement, pass: number, index: number): MusicEvent[] {
    const name = pass % 3 === 2 && index === 0 ? 'D' : arrangement.sections[index]
    const phrase = PHRASES[name]
    const lift = pass % 2 === 1 && (name === 'A' || name === 'A2') ? 12 : 0
    const events: MusicEvent[] = []
    for (const [voice, notes, shift] of [['lead', phrase.lead, lift], ['bass', phrase.bass, 0]] as const) {
        let at = 0
        for (const [pitch, length] of notes) {
            events.push({at, voice, pitch: pitch === null ? null : pitch + arrangement.transpose + shift, length})
            at += length
        }
    }
    const last = index === arrangement.sections.length - 1
    for (let bar = 0; bar < PHRASE_LENGTH / 16; bar++) {
        const fill = last && pass % 4 === 3 && bar === 1
        for (const [voice, steps] of Object.entries(DRUM_STEPS[arrangement.drums]) as [Voice, number[]][]) {
            for (const step of steps) {
                if (fill && step >= 8) continue
                events.push({at: bar * 16 + step, voice, pitch: null, length: 1})
            }
        }
        if (fill) for (let step = 8; step < 16; step++) events.push({at: bar * 16 + step, voice: 'snare', pitch: null, length: 1})
    }
    return events
}
