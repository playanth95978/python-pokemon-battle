/**
 * Pluie : des traits qui tombent dans une boîte autour de la caméra. Chaque goutte a sa place fixe dans le monde,
 * répétée tous les `BOX` mètres : en marchant on traverse l'averse au lieu de la traîner avec soi.
 * Tout le mouvement est dans le shader : rien n'est recalculé par image.
 */
import * as THREE from 'three'

const DROPS = 6000
const BOX = new THREE.Vector3(36, 16, 36)
const FALL_SPEED = 11

const vertexShader = `
    uniform float time;
    uniform float intensity;
    uniform vec3 center;
    uniform vec3 box;
    uniform vec2 wind;
    attribute vec4 drop;
    varying float vAlpha;
    #include <fog_pars_vertex>
    void main() {
        // drop.xyz : place dans la boîte (de 0 à 1) ; drop.w : 0 en tête de goutte, 1 en queue.
        float fall = mod(drop.y * box.y - time * ${FALL_SPEED.toFixed(1)}, box.y);
        vec3 world = vec3(drop.x * box.x, 0.0, drop.z * box.z) + vec3(wind.x, 0.0, wind.y) * (box.y - fall) * 0.08;
        world.xz = center.xz + mod(world.xz - center.xz + box.xz * 0.5, box.xz) - box.xz * 0.5;
        world.y = center.y - 4.0 + fall;
        // La queue suit la tête : un trait le long de la chute (vent compris).
        world += vec3(wind.x * 0.08, 1.0, wind.y * 0.08) * drop.w * 0.45;
        // Seule une part des gouttes tombe, selon l'intensité de la pluie.
        float shown = step(fract(drop.x * 91.7 + drop.z * 37.3), intensity);
        vAlpha = shown * (0.25 + 0.2 * drop.w);
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
    }`

const fragmentShader = `
    uniform vec3 color;
    varying float vAlpha;
    #include <fog_pars_fragment>
    void main() {
        if (vAlpha <= 0.0) discard;
        gl_FragColor = vec4(color, vAlpha);
        #include <fog_fragment>
    }`

export function createRain(scene: THREE.Scene) {
    const drops = new Float32Array(DROPS * 8)
    for (let index = 0; index < DROPS; index++) {
        const x = Math.random(), y = Math.random(), z = Math.random()
        drops.set([x, y, z, 0, x, y, z, 1], index * 8)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('drop', new THREE.BufferAttribute(drops, 4))
    // Positions factices : three.js en déduit le nombre de sommets.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROPS * 6), 3))
    const material = new THREE.ShaderMaterial({
        vertexShader, fragmentShader, transparent: true, depthWrite: false, fog: true,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
            time: {value: 0}, intensity: {value: 0}, center: {value: new THREE.Vector3()}, box: {value: BOX},
            wind: {value: new THREE.Vector2(1.2, 0.5)}, color: {value: new THREE.Color(0xc8d2dc)},
        }]),
    })
    const lines = new THREE.LineSegments(geometry, material)
    lines.name = 'pluie'
    lines.frustumCulled = false
    lines.visible = false
    scene.add(lines)

    return {
        object: lines,
        update(time: number, intensity: number, camera: THREE.Camera) {
            lines.visible = intensity > 0.01
            material.uniforms.time.value = time
            material.uniforms.intensity.value = intensity
            material.uniforms.center.value.copy(camera.position)
        },
    }
}
