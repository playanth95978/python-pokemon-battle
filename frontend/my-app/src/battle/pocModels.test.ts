/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { pocModelPath } from './pocModels'

it('reconnaît les noms des modèles en français et en anglais sans proposer de modèle absent', () => {
  expect(pocModelPath('PIKACHU')).toBe('/models/poc/pikachu.glb')
  expect(pocModelPath('Salamèche')).toBe('/models/poc/charmander.glb')
  expect(pocModelPath('charmander')).toBe('/models/poc/charmander.glb')
  expect(pocModelPath('Bulbizarre')).toBeNull()
})

it.each(['pikachu', 'charmander'])('livre un GLB valide avec géométries et les quatre animations : %s', (name) => {
  const bytes = readFileSync(`public/models/poc/${name}.glb`)
  expect(bytes.toString('utf8', 0, 4)).toBe('glTF')
  expect(bytes.readUInt32LE(4)).toBe(2)
  expect(bytes.readUInt32LE(8)).toBe(bytes.length)
  const length = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + length))
  expect(gltf.meshes.length).toBeGreaterThan(10)
  expect(gltf.animations.map((clip: {name: string}) => clip.name)).toEqual(['Idle', 'Attack', 'Hit', 'Faint'])
  expect(gltf.animations.every((clip: {channels: unknown[]}) => clip.channels.length > 0)).toBe(true)
})
