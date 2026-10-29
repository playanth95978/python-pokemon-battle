/**
 * Post-traitement des vues 3D, dans le style des dessins animés Pokémon : occlusion ambiante légère, puis en une passe
 * les contours à l'encre, le tone mapping et l'étalonnage (couleurs vives), enfin l'anticrénelage. L'ombrage en aplats
 * des matériaux est installé en même temps (voir celShading.ts).
 */
import { N8AOPass } from 'n8ao'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { installCelShading } from './celShading'

/**
 * Contours, tone mapping ACES (le même que celui de three.js), conversion sRGB puis étalonnage : couleurs franches
 * comme un dessin animé, lumière à peine chaude. Une seule passe plein écran au lieu de trois : sur un GPU intégré,
 * chacune coûte plusieurs millisecondes.
 *
 * Les contours suivent les ruptures de profondeur. On mesure la courbure de l'inverse de la profondeur, nulle sur
 * tout plan quel que soit l'angle de vue (elle varie linéairement à l'écran) : le sol rasant n'a pas de trait, seuls
 * les silhouettes et les arêtes en ont. Le trait se pose côté objet, assombrit sa propre couleur au lieu d'un noir
 * uniforme, et s'efface au loin où l'herbe et le feuillage le rendraient brouillon.
 */
const GradingShader = {
    name: 'GradingShader',
    uniforms: {
        tDiffuse: {value: null},
        tDepth: {value: null as THREE.Texture | null},
        pixelSize: {value: new THREE.Vector2()},
        cameraNear: {value: 0.1},
        cameraFar: {value: 1000},
        outline: {value: 0.82},
        outlineFade: {value: new THREE.Vector2(22, 55)},
        exposure: {value: 1},
        saturation: {value: 1.22},
        contrast: {value: 1.02},
        warmth: {value: new THREE.Vector3(1.02, 1, 0.97)},
        vignette: {value: 0.18},
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
    fragmentShader: `
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 pixelSize;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float outline;
        uniform vec2 outlineFade;
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
        float distanceAt(vec2 uv) {
            return -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, cameraNear, cameraFar);
        }
        // Courbure de l'inverse de la profondeur entre ce pixel et ses voisins à reach pixels, relative à sa distance.
        // Seule la courbure négative compte : les voisins sont plus loin, ce pixel est le bord de l'objet.
        float curvatureAt(float inverse, float reach) {
            vec2 x = vec2(pixelSize.x * reach, 0.0), y = vec2(0.0, pixelSize.y * reach);
            float across = 2.0 * inverse - 1.0 / distanceAt(vUv - x) - 1.0 / distanceAt(vUv + x);
            float along = 2.0 * inverse - 1.0 / distanceAt(vUv - y) - 1.0 / distanceAt(vUv + y);
            return (max(0.0, across) + max(0.0, along)) / inverse;
        }
        float ink() {
            float center = distanceAt(vUv);
            // Deux portées : un trait de deux pixels, lisible même en résolution réduite et après l'anticrénelage.
            float curvature = max(curvatureAt(1.0 / center, 1.0), curvatureAt(1.0 / center, 2.0));
            // Seuil assez haut pour ignorer les brins d'herbe, à peine décollés du sol : un personnage devant le
            // décor dépasse 0,2, une touffe d'herbe reste vers 0,03.
            float edge = smoothstep(0.05, 0.12, curvature);
            return edge * outline * (1.0 - smoothstep(outlineFade.x, outlineFade.y, center));
        }
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec3 inked = texel.rgb * (1.0 - 0.85 * ink());
            vec3 color = sRGBTransferOETF(vec4(acesFilmic(inked), 1.0)).rgb;
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luma), color, saturation);
            color = (color - 0.5) * contrast + 0.5;
            color *= warmth;
            vec2 offset = vUv - 0.5;
            color *= 1.0 - dot(offset, offset) * vignette;
            gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
        }`,
}

export function createPostProcessing(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    installCelShading()
    const size = renderer.getSize(new THREE.Vector2())
    const composer = new EffectComposer(renderer)
    // L'occlusion ambiante part de la profondeur de l'image rendue : les feuilles découpées (alphaTest) restent justes,
    // contrairement au GTAO de three.js qui redessine la scène sans leurs textures. Calculée en demi-résolution ;
    // l'eau transparente n'a pas besoin d'un second rendu dédié.
    const ambientOcclusion = new N8AOPass(scene, camera, size.x, size.y)
    ambientOcclusion.setQualityMode('Low')
    Object.assign(ambientOcclusion.configuration, {
        aoRadius: 1.6, distanceFalloff: 0.5, intensity: 1.3, halfRes: true, gammaCorrection: false,
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
            // n8ao recrée sa cible de rendu quand sa configuration change : on relit sa profondeur à chaque image.
            const depth = ambientOcclusion.beautyRenderTarget.depthTexture
            grading.uniforms.tDepth.value = depth
            grading.uniforms.pixelSize.value.set(1 / depth.image.width, 1 / depth.image.height)
            grading.uniforms.cameraNear.value = camera.near
            grading.uniforms.cameraFar.value = camera.far
            composer.render()
        },
        setSize: (width: number, height: number) => composer.setSize(width, height),
        setPixelRatio: (ratio: number) => composer.setPixelRatio(ratio),
    }
}
