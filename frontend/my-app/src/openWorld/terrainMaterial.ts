/** Matériau du terrain : couleur du biome par sommet, enrichie de près par des textures de détail. */
import * as THREE from 'three'

const TEXTURES = '/textures/polyhaven'
/** Une répétition de texture toutes les 4 unités. */
const DETAIL_SCALE = 4

function placeholder() {
    const texture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1)
    texture.needsUpdate = true
    return texture
}

export function createTerrainMaterial(renderer: THREE.WebGLRenderer) {
    const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.95, envMapIntensity: 0.4})
    const uniforms = {
        lushMap: {value: placeholder() as THREE.Texture},
        dryMap: {value: placeholder() as THREE.Texture},
        rockMap: {value: placeholder() as THREE.Texture},
    }
    const loader = new THREE.TextureLoader()
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    // Sous-bois pour l'herbe, terre clairsemée pour sable et toundra, enduit granuleux pour la roche.
    for (const [uniform, file] of [[uniforms.lushMap, 'forrest_ground_01'], [uniforms.dryMap, 'sparse_grass'], [uniforms.rockMap, 'plastered_wall_02']] as const) {
        void loader.loadAsync(`${TEXTURES}/${file}_diff_1k.jpg`).then((texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping
            texture.anisotropy = anisotropy
            uniform.value = texture
        }).catch(() => undefined)
    }
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms)
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
                attribute vec3 surface;
                varying vec3 vSurface;
                varying vec3 vWorld;
                varying vec3 vWorldNormal;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vSurface = surface;
                vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`)
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                uniform sampler2D lushMap;
                uniform sampler2D dryMap;
                uniform sampler2D rockMap;
                varying vec3 vSurface;
                varying vec3 vWorld;
                varying vec3 vWorldNormal;
                // Détail relatif : la texture divisée par sa couleur moyenne (dernier niveau de mipmap).
                // La teinte reste celle du biome, la texture n'apporte que le grain.
                vec3 detail(sampler2D map, vec2 uv) {
                    vec3 average = max(textureLod(map, vec2(0.5), 12.0).rgb, vec3(0.04));
                    return clamp(texture(map, uv).rgb / average, 0.35, 1.9);
                }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
                vec2 top = vWorld.xz / ${DETAIL_SCALE.toFixed(1)};
                // Projection triplanaire pour la roche : pas d'étirement sur les falaises.
                vec3 blend = pow(abs(vWorldNormal), vec3(4.0));
                blend /= blend.x + blend.y + blend.z;
                vec3 rock = detail(rockMap, vWorld.zy / 3.0) * blend.x + detail(rockMap, top) * blend.y + detail(rockMap, vWorld.xy / 3.0) * blend.z;
                vec3 grain = mix(detail(lushMap, top), detail(dryMap, top * 0.7), vSurface.x);
                grain = mix(grain, rock, vSurface.y);
                grain = mix(grain, vec3(1.0), vSurface.z * 0.75);
                // Au loin le grain scintillerait : il s'efface avant le brouillard.
                float near = 1.0 - smoothstep(50.0, 170.0, distance(vWorld, cameraPosition));
                diffuseColor.rgb *= mix(vec3(1.0), grain, near);`)
    }
    return material
}
