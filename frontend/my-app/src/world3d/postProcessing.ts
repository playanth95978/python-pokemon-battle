/** Post-traitement des vues 3D : occlusion ambiante, tone mapping et étalonnage en une passe, puis anticrénelage. */
import { N8AOPass } from 'n8ao'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/**
 * Tone mapping ACES (le même que celui de three.js), conversion sRGB puis étalonnage : couleurs un peu plus
 * riches, lumière chaude, bords assombris. Une seule passe plein écran au lieu de deux : sur un GPU intégré,
 * chacune coûte plusieurs millisecondes.
 */
const GradingShader = {
    name: 'GradingShader',
    uniforms: {
        tDiffuse: {value: null},
        exposure: {value: 1},
        saturation: {value: 1.12},
        contrast: {value: 1.07},
        warmth: {value: new THREE.Vector3(1.03, 1, 0.95)},
        vignette: {value: 0.55},
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float exposure;
        uniform float saturation;
        uniform float contrast;
        uniform vec3 warmth;
        uniform float vignette;
        varying vec2 vUv;
        vec3 acesFilmic(vec3 color) {
            const mat3 inputMatrix = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
            const mat3 outputMatrix = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
            color = inputMatrix * (color * exposure / 0.6);
            vec3 a = color * (color + 0.0245786) - 0.000090537;
            vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
            return clamp(outputMatrix * (a / b), 0.0, 1.0);
        }
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec3 color = sRGBTransferOETF(vec4(acesFilmic(texel.rgb), 1.0)).rgb;
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luma), color, saturation);
            color = (color - 0.5) * contrast + 0.5;
            color *= warmth;
            vec2 offset = vUv - 0.5;
            color *= 1.0 - dot(offset, offset) * vignette;
            gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
        }`,
}

export function createPostProcessing(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2())
    const composer = new EffectComposer(renderer)
    // L'occlusion ambiante part de la profondeur de l'image rendue : les feuilles découpées (alphaTest) restent justes,
    // contrairement au GTAO de three.js qui redessine la scène sans leurs textures. Calculée en demi-résolution ;
    // l'eau transparente n'a pas besoin d'un second rendu dédié.
    const ambientOcclusion = new N8AOPass(scene, camera, size.x, size.y)
    ambientOcclusion.setQualityMode('Low')
    Object.assign(ambientOcclusion.configuration, {
        aoRadius: 1.6, distanceFalloff: 0.5, intensity: 2.4, halfRes: true, gammaCorrection: false,
        transparencyAware: false, color: new THREE.Color(0x0c1008),
    })
    // Sans cela, n8ao réactive le second rendu dès qu'il voit un objet transparent dans la scène.
    ambientOcclusion.autoDetectTransparency = false
    composer.addPass(ambientOcclusion)
    // Pas de bloom : le ciel physique est bien plus lumineux que tout seuil utile et noierait l'image dans un voile blanc.
    const grading = new ShaderPass(GradingShader)
    composer.addPass(grading)
    // FXAA plutôt que SMAA : bien moins cher pour un lissage proche à cette distance de caméra.
    composer.addPass(new FXAAPass())
    return {
        composer,
        render() {
            grading.uniforms.exposure.value = renderer.toneMappingExposure
            composer.render()
        },
        setSize: (width: number, height: number) => composer.setSize(width, height),
        setPixelRatio: (ratio: number) => composer.setPixelRatio(ratio),
    }
}
