/**
 * Démembrement, sans three.js : quel membre une lame tranche selon le point d'impact, et quels triangles du maillage
 * animé retirer à la coupure. Le personnage est un seul maillage par pièce (jambes, pieds, corps, tête) déformé par
 * un squelette : un membre tranché reste dans le même maillage, mais ses os suivent leur propre solide physique
 * (voir ragdoll.ts). Les triangles à cheval sur la coupure s'étireraient entre les deux morceaux : on les retire.
 */

/** Noms d'os tels que GLTFLoader les donne (« UpperArm.L » devient « UpperArmL »). */
export type Limb = 'head' | 'armL' | 'armR' | 'forearmL' | 'forearmR' | 'thighL' | 'thighR' | 'shinL' | 'shinR'

export interface LimbDefinition {
    limb: Limb
    /** Os coupé : lui et ses descendants partent avec le membre. */
    bone: string
    /** Os rattachés au membre sans en descendre (les pieds pendent à la racine du modèle, pilotés en cinématique inverse). */
    extra: string[]
}

export const LIMBS: LimbDefinition[] = [
    {limb: 'head', bone: 'Head', extra: []},
    {limb: 'armL', bone: 'UpperArmL', extra: []},
    {limb: 'armR', bone: 'UpperArmR', extra: []},
    {limb: 'forearmL', bone: 'LowerArmL', extra: []},
    {limb: 'forearmR', bone: 'LowerArmR', extra: []},
    {limb: 'thighL', bone: 'UpperLegL', extra: ['FootL', 'PTL']},
    {limb: 'thighR', bone: 'UpperLegR', extra: ['FootR', 'PTR']},
    {limb: 'shinL', bone: 'LowerLegL', extra: ['FootL', 'PTL']},
    {limb: 'shinR', bone: 'LowerLegR', extra: ['FootR', 'PTR']},
]

export interface Point3 { x: number; y: number; z: number }

/**
 * Membre dont l'articulation est la plus proche du point d'impact : une lame qui frappe à hauteur d'épaule emporte le
 * bras, au genou la jambe, au cou la tête. `joints` donne la position de chaque articulation (os coupé) dans le monde.
 */
export function pickSeveredLimb(impact: Point3, joints: Partial<Record<Limb, Point3>>, exclude: Limb[] = []): Limb | null {
    let best: Limb | null = null, bestDistance = Infinity
    for (const [limb, at] of Object.entries(joints) as [Limb, Point3][]) {
        if (exclude.includes(limb)) continue
        const distance = Math.hypot(at.x - impact.x, at.y - impact.y, at.z - impact.z)
        if (distance < bestDistance) {
            best = limb
            bestDistance = distance
        }
    }
    return best
}

/**
 * Index des triangles conservés après la coupure. `owner[v]` dit pour chaque sommet si son os dominant appartient au
 * membre coupé. Un triangle entièrement d'un côté reste (il suit son morceau) ; un triangle à cheval est retiré.
 */
export function cutTriangles(index: ArrayLike<number>, owner: ArrayLike<boolean>): number[] {
    const kept: number[] = []
    for (let face = 0; face + 2 < index.length; face += 3) {
        const a = index[face], b = index[face + 1], c = index[face + 2]
        const inLimb = Number(owner[a]) + Number(owner[b]) + Number(owner[c])
        if (inLimb === 0 || inLimb === 3) kept.push(a, b, c)
    }
    return kept
}

/** Os dominant de chaque sommet : celui qui a le plus fort poids parmi ses quatre influences. */
export function dominantBones(skinIndex: ArrayLike<number>, skinWeight: ArrayLike<number>, vertexCount: number): Uint16Array {
    const dominant = new Uint16Array(vertexCount)
    for (let vertex = 0; vertex < vertexCount; vertex++) {
        let bone = skinIndex[vertex * 4], weight = skinWeight[vertex * 4]
        for (let slot = 1; slot < 4; slot++) {
            if (skinWeight[vertex * 4 + slot] > weight) {
                weight = skinWeight[vertex * 4 + slot]
                bone = skinIndex[vertex * 4 + slot]
            }
        }
        dominant[vertex] = bone
    }
    return dominant
}
