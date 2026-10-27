/** Types minimaux de n8ao (le paquet n'en fournit pas) : seule la passe pour l'EffectComposer de three.js est utilisée. */
declare module 'n8ao' {
    import type { Camera, Color, Scene } from 'three'
    import { Pass } from 'three/addons/postprocessing/Pass.js'

    export interface N8AOConfiguration {
        aoSamples: number
        aoRadius: number
        denoiseSamples: number
        denoiseRadius: number
        distanceFalloff: number
        intensity: number
        color: Color
        gammaCorrection: boolean
        halfRes: boolean
        depthAwareUpsampling: boolean
        screenSpaceRadius: boolean
        transparencyAware: boolean
    }

    export class N8AOPass extends Pass {
        constructor(scene: Scene, camera: Camera, width?: number, height?: number)
        configuration: N8AOConfiguration
        autoDetectTransparency: boolean
        setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void
    }
}
