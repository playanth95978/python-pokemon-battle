/** Bruit de simplex 2D déterministe : une même graine produit toujours le même monde. */

/** Générateur pseudo-aléatoire mulberry32, suffisant pour mélanger une table de permutation. */
export function seededRandom(seed: number) {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
}

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
const GRADIENTS = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]

export type Noise2D = (x: number, y: number) => number

/** Simplex 2D (Gustavson), valeurs dans [-1, 1]. */
export function createNoise2D(seed: number): Noise2D {
    const random = seededRandom(seed)
    const table = Array.from({length: 256}, (_, index) => index)
    for (let index = 255; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [table[index], table[swap]] = [table[swap], table[index]]
    }
    const permutation = new Uint8Array(512)
    for (let index = 0; index < 512; index++) permutation[index] = table[index & 255]

    function corner(gradient: number, x: number, y: number) {
        const falloff = 0.5 - x * x - y * y
        if (falloff < 0) return 0
        const [gx, gy] = GRADIENTS[gradient & 7]
        return falloff ** 4 * (gx * x + gy * y)
    }

    return (x, y) => {
        const skew = (x + y) * F2
        const i = Math.floor(x + skew), j = Math.floor(y + skew)
        const unskew = (i + j) * G2
        const x0 = x - (i - unskew), y0 = y - (j - unskew)
        const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1]
        const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2
        const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2
        const ii = i & 255, jj = j & 255
        return 70 * (corner(permutation[ii + permutation[jj]], x0, y0)
            + corner(permutation[ii + i1 + permutation[jj + j1]], x1, y1)
            + corner(permutation[ii + 1 + permutation[jj + 1]], x2, y2))
    }
}

/** Somme d'octaves (fBm) normalisée dans [-1, 1] : grandes formes plus détails fins. */
export function fbm(noise: Noise2D, x: number, y: number, octaves: number, gain = 0.5, lacunarity = 2) {
    let sum = 0, amplitude = 1, frequency = 1, total = 0
    for (let octave = 0; octave < octaves; octave++) {
        sum += noise(x * frequency, y * frequency) * amplitude
        total += amplitude
        amplitude *= gain
        frequency *= lacunarity
    }
    return sum / total
}

/** Bruit « crêtes » dans [0, 1] : arêtes vives typiques des chaînes de montagnes. */
export function ridged(noise: Noise2D, x: number, y: number, octaves: number) {
    let sum = 0, amplitude = 0.5, frequency = 1, weight = 1, total = 0
    for (let octave = 0; octave < octaves; octave++) {
        let value = 1 - Math.abs(noise(x * frequency, y * frequency))
        value *= value * weight
        weight = Math.min(1, value * 2)
        sum += value * amplitude
        total += amplitude
        amplitude *= 0.5
        frequency *= 2.1
    }
    return sum / total
}
