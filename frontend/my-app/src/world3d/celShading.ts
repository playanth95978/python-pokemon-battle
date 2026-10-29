/**
 * Ombrage en aplats, façon dessin animé : la lumière directe (soleil, lanternes) ne dégrade plus selon l'angle, elle
 * passe d'un coup de l'ombre à la lumière, avec une seconde marche plus claire face au soleil. La lumière d'ambiance
 * reste douce et donne la couleur des ombres. Le correctif touche les morceaux de shader partagés de three.js : tous
 * les matériaux standard et Lambert en profitent, y compris ceux qui étendent leur shader (sol, eau, feuillage).
 * Le relief des cartes de normales est aussi aplati : avec une lumière en marches, chaque grain de pierre ou d'écorce
 * basculerait sinon entre ombre et lumière et piquetterait les surfaces de taches noires.
 */
import * as THREE from 'three'

const IRRADIANCE = 'vec3 irradiance = dotNL * directLight.color;'
const NORMAL_DETAIL = 'mapN.xy *= normalScale;'
/** Part du relief des cartes de normales conservée. */
const KEPT_RELIEF = 0.3

/** Rampe de lumière : ombre franche, liseré très court, puis deux tons éclairés. */
const TOON_RAMP = `
float toonRamp( const in float dotNL ) {
	float lit = smoothstep( 0.02, 0.08, dotNL );
	return lit * ( 0.72 + 0.26 * smoothstep( 0.5, 0.56, dotNL ) );
}
`

type LightChunks = Pick<typeof THREE.ShaderChunk, 'lights_physical_pars_fragment' | 'lights_lambert_pars_fragment' | 'normal_fragment_maps'>

/** Version en aplats des morceaux d'éclairage ; échoue si three.js a changé ce qu'on remplace, plutôt que de rien faire. */
export function celShadedChunks(chunks: LightChunks): LightChunks {
    const patch = (source: string) => {
        if (source.includes('toonRamp(')) return source
        if (!source.includes(IRRADIANCE)) throw new Error('Éclairage de three.js inattendu : ombrage en aplats impossible')
        return TOON_RAMP + source.replace(IRRADIANCE, 'vec3 irradiance = toonRamp( dotNL ) * directLight.color;')
    }
    const relief = chunks.normal_fragment_maps
    if (!relief.includes(NORMAL_DETAIL) && !relief.includes('TOON_RELIEF')) throw new Error('Cartes de normales de three.js inattendues : ombrage en aplats impossible')
    return {
        lights_physical_pars_fragment: patch(chunks.lights_physical_pars_fragment),
        lights_lambert_pars_fragment: patch(chunks.lights_lambert_pars_fragment),
        normal_fragment_maps: relief.replace(NORMAL_DETAIL, `mapN.xy *= normalScale * ${KEPT_RELIEF.toFixed(2)}; // TOON_RELIEF`),
    }
}

/** À appeler avant le premier rendu : les shaders déjà compilés garderaient l'ancien éclairage. */
export function installCelShading() {
    Object.assign(THREE.ShaderChunk, celShadedChunks(THREE.ShaderChunk))
}
