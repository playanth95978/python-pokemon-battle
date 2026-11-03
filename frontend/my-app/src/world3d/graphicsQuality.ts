/**
 * Niveau de détail du rendu selon la carte graphique. Les réglages historiques visent un GPU intégré ; une carte
 * dédiée (GeForce, Radeon RX, Arc) a la marge pour des ombres plus fines, un décor plus profond, plus d'herbe et une
 * image suréchantillonnée. `?quality=high` ou `?quality=standard` dans l'adresse force le niveau.
 */
import { CHUNK_SIZE, GRASS_RADIUS, GRASS_UNLOAD_RADIUS, LOAD_RADIUS, UNLOAD_RADIUS, VIEW_DISTANCE } from './worldChunks'

export type QualityLevel = 'standard' | 'high'

export interface GraphicsQuality {
    level: QualityLevel
    /** Carte d'ombre du soleil : définition (texels) et demi-largeur couverte (unités du monde). */
    shadowMapSize: number
    shadowExtent: number
    /** Plafond de la résolution dynamique ; au-delà de la densité de l'écran, l'image est suréchantillonnée. */
    maxPixelRatio: number
    anisotropy: number
    /** Rayons de chargement du décor et de l'herbe (en chunks), et distance où la brume masque tout. */
    loadRadius: number
    unloadRadius: number
    grassRadius: number
    grassUnloadRadius: number
    viewDistance: number
    ambientOcclusion: 'Low' | 'Medium'
    /** Occlusion ambiante calculée en demi-résolution (moins chère, plus floue). */
    ambientOcclusionHalfRes: boolean
}

/** Cartes dédiées reconnues dans le nom renvoyé par WebGL (souvent enveloppé par ANGLE : « ANGLE (NVIDIA, …) »). */
const DEDICATED_GPU = /nvidia|geforce|quadro|\brtx\b|radeon (rx|pro)|\barc\b/i

const HIGH_LOAD_RADIUS = 8

export function pickQuality(gpu: string | null, search = '', devicePixelRatio = 1): GraphicsQuality {
    const forced = new URLSearchParams(search).get('quality')
    const level: QualityLevel = forced === 'high' || forced === 'standard' ? forced
        : gpu && DEDICATED_GPU.test(gpu) ? 'high' : 'standard'
    if (level === 'standard') {
        return {
            level, shadowMapSize: 3072, shadowExtent: 20, maxPixelRatio: Math.min(devicePixelRatio, 2), anisotropy: 8,
            loadRadius: LOAD_RADIUS, unloadRadius: UNLOAD_RADIUS, grassRadius: GRASS_RADIUS, grassUnloadRadius: GRASS_UNLOAD_RADIUS,
            viewDistance: VIEW_DISTANCE, ambientOcclusion: 'Low', ambientOcclusionHalfRes: true,
        }
    }
    return {
        // Ombre plus large et pourtant plus fine : 24 × 2 / 4096 ≈ 1,2 cm par texel, contre 1,3 cm.
        level, shadowMapSize: 4096, shadowExtent: 24,
        // La résolution dynamique redescend d'elle-même si la carte peine (voir createResolutionScaler).
        maxPixelRatio: 2, anisotropy: 16,
        loadRadius: HIGH_LOAD_RADIUS, unloadRadius: HIGH_LOAD_RADIUS + 1, grassRadius: 2, grassUnloadRadius: 3,
        // Même marge de quatre cases que VIEW_DISTANCE avant la limite garantie des chunks.
        viewDistance: HIGH_LOAD_RADIUS * CHUNK_SIZE - 4, ambientOcclusion: 'Medium', ambientOcclusionHalfRes: false,
    }
}

/** Nom de la carte graphique utilisée par le navigateur, quand il le communique. */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
    return typeof name === 'string' ? name : null
}
