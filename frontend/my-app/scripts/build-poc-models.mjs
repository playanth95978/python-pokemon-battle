/** Modèles stylisés originaux du POC, générés sans fichiers extraits des jeux. */
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mkdir, writeFile } from 'node:fs/promises'

// GLTFExporter utilise FileReader pour ses blobs ; Node fournit déjà Blob.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.() }) }
  readAsDataURL(blob) { blob.arrayBuffer().then((result) => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.() }) }
}

function material(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, emissive, emissiveIntensity: 0.7 })
}
function ellipsoid(parent, mat, position, scale, name = '') {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat)
  mesh.position.set(...position); mesh.scale.set(...scale); mesh.name = name
  parent.add(mesh)
  return mesh
}
function pivot(parent, name, position) {
  const group = new THREE.Group(); group.name = name; group.position.set(...position); parent.add(group)
  return group
}
function segment(parent, mat, start, end, radius) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end)
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius, a.distanceTo(b), 10), mat)
  mesh.position.copy(a).lerp(b, 0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize())
  parent.add(mesh)
  return mesh
}
function eyes(head, iris) {
  const black = material(0x18212b), white = material(0xffffff)
  for (const side of [-1, 1]) {
    ellipsoid(head, black, [side * 0.205, 0.055, 0.395], [0.092, 0.125, 0.045])
    if (iris) ellipsoid(head, iris, [side * 0.205, 0.025, 0.434], [0.06, 0.075, 0.018])
    ellipsoid(head, white, [side * 0.19, 0.095, 0.443], [0.026, 0.037, 0.014])
  }
  ellipsoid(head, black, [0, -0.055, 0.46], [0.037, 0.023, 0.025])
  const smile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.13, -0.18, 0.41), new THREE.Vector3(0, -0.22, 0.445), new THREE.Vector3(0.13, -0.18, 0.41),
  ])
  head.add(new THREE.Mesh(new THREE.TubeGeometry(smile, 14, 0.012, 6, false), black))
}

function pikachu() {
  const root = new THREE.Group(); root.name = 'Pikachu'
  const rig = pivot(root, 'Rig', [0, 0, 0])
  const yellow = material(0xffcc29), brown = material(0x92522c), black = material(0x24252c)
  ellipsoid(rig, yellow, [0, 0.75, 0], [0.43, 0.62, 0.33])
  const head = pivot(rig, 'Head', [0, 1.46, 0.045])
  ellipsoid(head, yellow, [0, 0, 0], [0.49, 0.43, 0.4])
  eyes(head)
  const red = material(0xe9533d)
  for (const side of [-1, 1]) {
    ellipsoid(head, red, [side * 0.36, -0.115, 0.28], [0.105, 0.082, 0.06])
    const ear = pivot(head, side < 0 ? 'EarLeft' : 'EarRight', [side * 0.27, 0.29, 0])
    ellipsoid(ear, yellow, [side * 0.085, 0.25, 0], [0.105, 0.36, 0.078])
    ellipsoid(ear, black, [side * 0.14, 0.52, 0], [0.075, 0.15, 0.065])
    const arm = pivot(rig, side < 0 ? 'ArmLeft' : 'ArmRight', [side * 0.35, 0.98, 0.06])
    ellipsoid(arm, yellow, [side * 0.12, -0.2, 0.035], [0.12, 0.28, 0.12])
    ellipsoid(rig, yellow, [side * 0.24, 0.115, 0.15], [0.15, 0.11, 0.29])
    ellipsoid(rig, brown, [0, 0.82 + side * 0.15, -0.3], [0.3, 0.06, 0.045])
  }
  const tail = pivot(rig, 'Tail', [0.2, 0.48, -0.25])
  const shape = new THREE.Shape()
  shape.moveTo(0, 0); shape.lineTo(0.2, 0.24); shape.lineTo(0.08, 0.4)
  shape.lineTo(0.32, 0.65); shape.lineTo(0.22, 0.8); shape.lineTo(0.65, 1.03)
  shape.lineTo(0.8, 0.72); shape.lineTo(0.48, 0.6); shape.lineTo(0.58, 0.43)
  shape.lineTo(0.32, 0.25); shape.lineTo(0.39, 0.11); shape.lineTo(0.12, -0.07); shape.closePath()
  const bolt = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: false }), yellow)
  bolt.rotation.y = -0.5; bolt.position.z = -0.27; tail.add(bolt)
  segment(tail, brown, [0, 0, 0], [0.2, 0.24, -0.15], 0.075)
  return root
}

function charmander() {
  const root = new THREE.Group(); root.name = 'Charmander'
  const rig = pivot(root, 'Rig', [0, 0, 0])
  const orange = material(0xef913f), cream = material(0xffe0a2), blue = material(0x3aa9ba)
  ellipsoid(rig, orange, [0, 0.75, 0], [0.4, 0.63, 0.32])
  ellipsoid(rig, cream, [0, 0.67, 0.255], [0.29, 0.46, 0.085])
  const head = pivot(rig, 'Head', [0, 1.48, 0.04])
  ellipsoid(head, orange, [0, 0, 0], [0.43, 0.43, 0.38])
  ellipsoid(head, orange, [0, -0.13, 0.27], [0.33, 0.21, 0.23])
  eyes(head, blue)
  for (const side of [-1, 1]) {
    const arm = pivot(rig, side < 0 ? 'ArmLeft' : 'ArmRight', [side * 0.33, 1.01, 0.01])
    ellipsoid(arm, orange, [side * 0.14, -0.19, 0.07], [0.115, 0.26, 0.115])
    ellipsoid(rig, orange, [side * 0.23, 0.18, 0.04], [0.18, 0.24, 0.19])
    ellipsoid(rig, orange, [side * 0.23, 0.1, 0.2], [0.18, 0.1, 0.28])
    for (let i = 0; i < 3; i++) ellipsoid(rig, cream, [side * 0.23 + (i - 1) * 0.08, 0.1, 0.435], [0.03, 0.035, 0.065])
  }
  const tail = pivot(rig, 'Tail', [0, 0.38, -0.2])
  const points = [[0, 0, 0], [0.15, -0.06, -0.3], [0.3, 0.04, -0.62], [0.35, 0.34, -0.85]]
  for (let i = 0; i < points.length - 1; i++) segment(tail, orange, points[i], points[i + 1], 0.14 - i * 0.035)
  const flame = pivot(tail, 'Flame', [0.35, 0.55, -0.85])
  ellipsoid(flame, material(0xff6229, 0xff4400), [0, 0, 0], [0.15, 0.3, 0.14])
  ellipsoid(flame, material(0xffdf49, 0xffb000), [0, -0.05, 0.09], [0.085, 0.19, 0.07])
  return root
}

function rotation(name, axis, times, angles) {
  const values = angles.flatMap((angle) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), angle).toArray())
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values)
}
function clips(root) {
  const idle = [new THREE.VectorKeyframeTrack('Rig.position', [0, 0.8, 1.6], [0, 0, 0, 0, 0.035, 0, 0, 0, 0]),
    rotation('Head', [0, 1, 0], [0, 0.8, 1.6], [-0.07, 0.07, -0.07]),
    rotation('Tail', [0, 1, 0], [0, 0.8, 1.6], [-0.1, 0.1, -0.1])]
  if (root.name === 'Pikachu') idle.push(rotation('EarLeft', [0, 0, 1], [0, 0.8, 1.6], [-0.1, 0.1, -0.1]))
  return [new THREE.AnimationClip('Idle', 1.6, idle),
    new THREE.AnimationClip('Attack', 1.1, [
      new THREE.VectorKeyframeTrack('Rig.position', [0, 0.2, 0.45, 0.8, 1.1], [0, 0, 0, 0, 0.03, -0.1, 0, 0.08, 0.48, 0, 0, 0.1, 0, 0, 0]),
      rotation('ArmLeft', [1, 0, 0], [0, 0.4, 1.1], [0, -1.2, 0]),
      rotation('ArmRight', [1, 0, 0], [0, 0.4, 1.1], [0, -1.2, 0]),
    ]),
    new THREE.AnimationClip('Hit', 0.4, [new THREE.VectorKeyframeTrack('Rig.position', [0, 0.1, 0.25, 0.4], [0, 0, 0, 0.08, 0, -0.2, -0.05, 0, -0.1, 0, 0, 0])]),
    new THREE.AnimationClip('Faint', 0.7, [rotation('Rig', [1, 0, 0], [0, 0.7], [0, -Math.PI / 2]),
      new THREE.VectorKeyframeTrack('Rig.position', [0, 0.7], [0, 0, 0, 0, 0.25, 0])]),
  ]
}

const destination = new URL('../public/models/poc/', import.meta.url)
await mkdir(destination, { recursive: true })
for (const [file, root] of [['pikachu', pikachu()], ['charmander', charmander()]]) {
  const data = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips(root) })
  await writeFile(new URL(`${file}.glb`, destination), Buffer.from(data))
  console.log(`${file}.glb : ${data.byteLength} octets`)
}
