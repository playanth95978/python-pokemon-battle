/**
 * Eau commune aux vues 3D : vagues qui déplacent la surface, rides en deux couches, reflets miroir (Reflector),
 * réfraction du fond, couleur qui s'assombrit avec l'épaisseur d'eau, écume aux rives et reflet du soleil.
 * L'épaisseur vient d'un rendu préalable de la scène sans l'eau (couleur + profondeur) : elle vaut pour un lac
 * comme pour la mer, sans connaître le relief.
 */
import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'

export interface WaterOptions {
    width: number
    depth: number
    /** Subdivisions par côté ; `focused` les resserre au centre (plan qui suit le joueur). */
    segments: number
    focused?: boolean
    /** Hauteur des vagues et longueur de la plus grande, en unités du monde. */
    waveHeight: number
    wavelength: number
    shallowColor: THREE.ColorRepresentation
    deepColor: THREE.ColorRepresentation
    /** Absorption par unité d'épaisseur : plus elle est forte, plus l'eau est opaque. */
    absorption: number
    foamWidth: number
    /**
     * Surface variable (crue) : texture par case, R = hauteur de l'eau dans le monde, G = part d'eau boueuse ;
     * `rect` = origine x, z et taille de la zone couverte. Sans elle, la surface est plane.
     */
    surface?: { map: THREE.Texture; rect: THREE.Vector4; muddyColor: THREE.ColorRepresentation }
}

/** Direction (x, z), longueur relative à `wavelength` et part de `waveHeight` de chaque vague. */
const WAVES = [
    [1, 0.35, 1, 0.5],
    [-0.4, 1, 0.61, 0.27],
    [0.75, -0.65, 0.37, 0.15],
    [-0.9, -0.3, 0.23, 0.08],
]

/**
 * Rides : somme d'ondes aux fréquences entières (texture répétable sans couture). RGB = normale,
 * alpha = hauteur, qui sert de motif à l'écume.
 */
function rippleTexture(size = 256) {
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const waves = Array.from({length: 28}, () => {
        const kx = Math.round((random() - 0.5) * 22) || 1, ky = Math.round((random() - 0.5) * 22)
        return {kx, ky, amplitude: 1 / Math.pow(Math.hypot(kx, ky), 1.3), phase: random() * Math.PI * 2}
    })
    const slopes = new Float32Array(size * size * 3)
    let maxSlope = 0, minHeight = Infinity, maxHeight = -Infinity
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let dx = 0, dy = 0, height = 0
            for (const wave of waves) {
                const angle = Math.PI * 2 * (wave.kx * x + wave.ky * y) / size + wave.phase
                height += wave.amplitude * Math.sin(angle)
                dx += wave.amplitude * wave.kx * Math.cos(angle)
                dy += wave.amplitude * wave.ky * Math.cos(angle)
            }
            slopes.set([dx, dy, height], (y * size + x) * 3)
            maxSlope = Math.max(maxSlope, Math.abs(dx), Math.abs(dy))
            minHeight = Math.min(minHeight, height)
            maxHeight = Math.max(maxHeight, height)
        }
    }
    const data = new Uint8Array(size * size * 4)
    const normal = new THREE.Vector3()
    for (let index = 0; index < size * size; index++) {
        normal.set(-slopes[index * 3] / maxSlope * 0.8, -slopes[index * 3 + 1] / maxSlope * 0.8, 1).normalize()
        const height = (slopes[index * 3 + 2] - minHeight) / (maxHeight - minHeight)
        data.set([(normal.x * 0.5 + 0.5) * 255, (normal.y * 0.5 + 0.5) * 255, (normal.z * 0.5 + 0.5) * 255, height * 255], index * 4)
    }
    const texture = new THREE.DataTexture(data, size, size)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
    return texture
}

const vertexShader = `
    uniform mat4 textureMatrix;
    uniform float time;
    uniform float waveHeight;
    uniform float wavelength;
    uniform vec4 waves[4];
    varying vec4 vReflectCoord;
    varying vec3 vWorld;
    varying vec3 vWaveNormal;
    varying float vViewDepth;
    varying float vMuddy;
    #ifdef USE_SURFACE
        uniform sampler2D surfaceMap;
        uniform vec4 surfaceRect;
    #endif
    #include <fog_pars_vertex>
    void main() {
        vec3 local = position;
        vMuddy = 0.0;
        #ifdef USE_SURFACE
            // Le plan est couché (son z local est la hauteur) : chaque sommet monte au niveau de l'eau de sa case.
            vec2 planar = (modelMatrix * vec4(position, 1.0)).xz;
            vec4 surface = textureLod(surfaceMap, (planar - surfaceRect.xy) / surfaceRect.zw, 0.0);
            local.z += surface.r - modelMatrix[3].y;
            vMuddy = surface.g;
        #endif
        vReflectCoord = textureMatrix * vec4(local, 1.0);
        vec4 world = modelMatrix * vec4(local, 1.0);
        float height = 0.0;
        vec2 slope = vec2(0.0);
        for (int index = 0; index < 4; index++) {
            vec2 direction = normalize(waves[index].xy);
            float k = 6.2831853 / (wavelength * waves[index].z);
            float amplitude = waveHeight * waves[index].w;
            // Vitesse des vagues de gravité : les longues vont plus vite que les courtes.
            float phase = k * dot(direction, world.xz) - sqrt(9.8 * k) * time;
            height += amplitude * sin(phase);
            slope += amplitude * k * direction * cos(phase);
        }
        world.y += height;
        vWorld = world.xyz;
        vWaveNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec4 mvPosition = viewMatrix * world;
        vViewDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
    }`

const fragmentShader = `
    uniform sampler2D reflectionMap;
    uniform sampler2D sceneColor;
    uniform sampler2D sceneDepth;
    uniform sampler2D ripples;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float time;
    uniform vec3 sunDirection;
    uniform vec3 shallowColor;
    uniform vec3 deepColor;
    uniform float absorption;
    uniform float foamWidth;
    uniform vec3 muddyColor;
    uniform float rain;
    varying vec4 vReflectCoord;
    varying vec3 vWorld;
    varying vec3 vWaveNormal;
    varying float vViewDepth;
    varying float vMuddy;
    #include <packing>
    #include <fog_pars_fragment>

    float sceneDistance(vec2 uv) {
        return -perspectiveDepthToViewZ(texture2D(sceneDepth, uv).x, cameraNear, cameraFar);
    }

    void main() {
        // Deux couches de rides qui dérivent dans des sens différents : jamais le même motif deux fois.
        vec4 rippleA = texture2D(ripples, vWorld.xz / 6.0 + vec2(time * 0.031, time * 0.017));
        vec4 rippleB = texture2D(ripples, vWorld.xz / 2.3 - vec2(time * 0.022, -time * 0.027));
        vec2 detail = (rippleA.xy * 2.0 - 1.0) + (rippleB.xy * 2.0 - 1.0) * 0.6;
        // Pluie : un clapotis fin et rapide, qui change de motif plusieurs fois par seconde.
        if (rain > 0.0) {
            vec4 dropsA = texture2D(ripples, vWorld.xz * 1.7 + vec2(floor(time * 6.0) * 0.37, floor(time * 6.0) * 0.61));
            vec4 dropsB = texture2D(ripples, vWorld.xz * 2.3 - vec2(floor(time * 5.0 + 0.5) * 0.53, floor(time * 5.0 + 0.5) * 0.29));
            detail += ((dropsA.xy + dropsB.xy) - 1.0) * rain * 1.2;
        }
        vec3 viewVector = cameraPosition - vWorld;
        vec3 viewDirection = normalize(viewVector);
        // Au loin les rides s'effacent : elles scintilleraient.
        float rippleFade = 1.0 - smoothstep(20.0, 120.0, length(viewVector));
        vec3 normal = normalize(vWaveNormal + vec3(detail.x, 0.0, detail.y) * 0.35 * rippleFade);

        // Réfraction : le fond vu à travers l'eau, déformé par les vagues sauf là où un objet passe devant.
        vec2 screen = gl_FragCoord.xy / resolution;
        float thickness = max(sceneDistance(screen) - vViewDepth, 0.0);
        vec2 refractedUv = screen + normal.xz * 0.04 * clamp(thickness, 0.0, 1.0);
        float refractedThickness = sceneDistance(refractedUv) - vViewDepth;
        if (refractedThickness < 0.0) {
            refractedUv = screen;
            refractedThickness = thickness;
        }
        vec3 refracted = texture2D(sceneColor, refractedUv).rgb;
        // La lumière est absorbée avec l'épaisseur traversée : clair et teinté au bord, sombre au large.
        // L'eau de crue charrie de la terre : brune et vite opaque.
        float opacity = 1.0 - exp(-refractedThickness * absorption * (1.0 + vMuddy * 5.0));
        vec3 body = mix(refracted * mix(shallowColor, muddyColor, vMuddy * 0.7), mix(deepColor, muddyColor * 0.55, vMuddy), opacity);

        // Reflet miroir, déformé par la surface ; Fresnel de Schlick (eau : 2 % de face, tout en rasant).
        vec2 reflectedUv = vReflectCoord.xy / vReflectCoord.w + normal.xz * 0.05;
        vec3 reflected = texture2D(reflectionMap, reflectedUv).rgb;
        float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(normal, viewDirection), 0.0), 5.0);
        vec3 color = mix(body, reflected, fresnel);

        // Reflet du soleil sur les crêtes.
        vec3 halfVector = normalize(sunDirection + viewDirection);
        color += vec3(1.0, 0.86, 0.62) * pow(max(dot(normal, halfVector), 0.0), 700.0) * 8.0 * (1.0 - rain);

        // Écume : là où l'eau est mince (rives, objets qui sortent de l'eau), découpée par le motif des rides.
        // Le motif domine : une frange irrégulière, pas un liseré blanc tout autour de la rive.
        float shore = 1.0 - smoothstep(0.0, foamWidth, thickness);
        float pattern = smoothstep(0.55, 0.85, rippleA.a * 0.6 + rippleB.a * 0.4 + shore * 0.2);
        // Sur l'eau boueuse, une mousse jaunâtre et plus rare.
        color = mix(color, mix(vec3(0.92, 0.95, 0.95), vec3(0.7, 0.62, 0.5), vMuddy), shore * pattern * 0.6 * (1.0 - vMuddy * 0.6));

        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
    }`

/** Plan subdivisé, posé à plat ; `focused` resserre les sommets au centre (x ↦ x² en gardant le signe). */
function surfaceGeometry({width, depth, segments, focused}: WaterOptions) {
    const geometry = new THREE.PlaneGeometry(2, 2, segments, segments)
    const position = geometry.attributes.position
    for (let index = 0; index < position.count; index++) {
        const x = position.getX(index), y = position.getY(index)
        const warp = (value: number) => focused ? Math.sign(value) * value * value : value
        position.setXY(index, warp(x) * width / 2, warp(y) * depth / 2)
    }
    geometry.computeBoundingSphere()
    return geometry
}

function hideAll(objects: THREE.Object3D[]) {
    return objects.map((object) => {
        const shown = object.visible
        object.visible = false
        return shown
    })
}

function showAll(objects: THREE.Object3D[], shown: boolean[]) {
    objects.forEach((object, index) => { object.visible = shown[index] })
}

export function createWater(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sunDirection: THREE.Vector3, options: WaterOptions) {
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2())
    // Reflet et réfraction en demi-résolution : déformés par les vagues, leur flou ne se voit pas.
    const reflector = new Reflector(surfaceGeometry(options), {
        textureWidth: buffer.x / 2, textureHeight: buffer.y / 2, clipBias: 0.003, multisample: 0,
    })
    const reflectorMaterial = reflector.material as THREE.ShaderMaterial
    const prepass = new THREE.WebGLRenderTarget(buffer.x / 2, buffer.y / 2, {type: THREE.HalfFloatType})
    prepass.depthTexture = new THREE.DepthTexture(buffer.x / 2, buffer.y / 2)
    const material = new THREE.ShaderMaterial({
        name: 'WaterShader',
        vertexShader,
        fragmentShader,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
            textureMatrix: {value: null},
            reflectionMap: {value: null},
            sceneColor: {value: null},
            sceneDepth: {value: null},
            ripples: {value: null},
            resolution: {value: new THREE.Vector2()},
            cameraNear: {value: 0.1},
            cameraFar: {value: 1000},
            time: {value: 0},
            waveHeight: {value: options.waveHeight},
            wavelength: {value: options.wavelength},
            waves: {value: WAVES.map(([x, z, length, share]) => new THREE.Vector4(x, z, length, share))},
            sunDirection: {value: sunDirection},
            shallowColor: {value: new THREE.Color(options.shallowColor)},
            deepColor: {value: new THREE.Color(options.deepColor)},
            absorption: {value: options.absorption},
            foamWidth: {value: options.foamWidth},
            muddyColor: {value: new THREE.Color(options.surface?.muddyColor ?? options.deepColor)},
            rain: {value: 0},
        }]),
        defines: options.surface ? {USE_SURFACE: ''} : {},
    })
    // Le Reflector garde sa caméra miroir et sa cible ; seul le matériau change. Ses matrices sont partagées par référence.
    Object.assign(material.uniforms, {
        textureMatrix: reflectorMaterial.uniforms.textureMatrix,
        reflectionMap: {value: reflector.getRenderTarget().texture},
        sceneColor: {value: prepass.texture},
        sceneDepth: {value: prepass.depthTexture},
        ripples: {value: rippleTexture()},
        // Après la fusion, qui copierait la texture : la crue la met à jour à chaque image.
        surfaceMap: {value: options.surface?.map ?? null},
        surfaceRect: {value: options.surface?.rect ?? new THREE.Vector4()},
    })
    reflectorMaterial.dispose()
    reflector.material = material
    reflector.rotation.x = -Math.PI / 2
    scene.add(reflector)
    // Objets que le miroir peut sauter (voir prepare) : masqués le temps de son rendu.
    let unreflected: THREE.Object3D[] = []
    const reflect = reflector.onBeforeRender.bind(reflector)
    reflector.onBeforeRender = (...args) => {
        const shown = hideAll(unreflected)
        reflect(...args)
        showAll(unreflected, shown)
    }

    return {
        mesh: reflector,
        /** Intensité de la pluie sur l'eau, de 0 à 1. */
        setRain(value: number) {
            material.uniforms.rain.value = value
        },
        /**
         * À appeler avant le rendu de l'image : rend la scène sans l'eau (couleur et profondeur du fond).
         * `skip.reflection` : objets dont le reflet ne se verrait pas (petits, loin de l'eau) ;
         * `skip.refraction` : objets jamais vus à travers l'eau (loin de toute rive).
         * Sans objets à sauter, les ombres sont calculées ici, une fois par image, et réutilisées par le reflet et
         * le rendu principal ; sinon c'est le rendu principal qui les calcule, avec tous les objets.
         */
        prepare(camera: THREE.PerspectiveCamera, seconds: number, skip: { reflection?: THREE.Object3D[]; refraction?: THREE.Object3D[] } = {}) {
            unreflected = skip.reflection ?? []
            const unrefracted = skip.refraction ?? []
            renderer.getDrawingBufferSize(buffer)
            const width = Math.max(1, Math.floor(buffer.x / 2)), height = Math.max(1, Math.floor(buffer.y / 2))
            if (prepass.width !== width || prepass.height !== height) {
                prepass.setSize(width, height)
                reflector.getRenderTarget().setSize(width, height)
            }
            material.uniforms.resolution.value.copy(buffer)
            material.uniforms.cameraNear.value = camera.near
            material.uniforms.cameraFar.value = camera.far
            material.uniforms.time.value = seconds
            reflector.visible = false
            const shown = hideAll(unrefracted)
            renderer.shadowMap.autoUpdate = !unrefracted.length
            renderer.setRenderTarget(prepass)
            renderer.render(scene, camera)
            renderer.setRenderTarget(null)
            renderer.shadowMap.autoUpdate = false
            renderer.shadowMap.needsUpdate = unrefracted.length > 0
            showAll(unrefracted, shown)
            reflector.visible = true
        },
    }
}
