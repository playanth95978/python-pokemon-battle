import { ATTACK_DURATION } from './attackPlayback'
import type { AttackClip } from './attackPlayback'

/** Bruitages synthétisés localement : aucune requête réseau ni extrait des jeux. */
export function createAttackAudio() {
  const context = new AudioContext()
  const master = context.createGain(); master.gain.value = 0.2; master.connect(context.destination)
  let nodes: AudioNode[] = [], sources: AudioScheduledSourceNode[] = []
  function stop() {
    sources.forEach((source) => {try {source.stop()} catch { /* Source déjà terminée. */ }})
    nodes.forEach((node) => node.disconnect()); sources = []; nodes = []
  }
  function tone(type: OscillatorType, frequency: number, end: number, at: number, duration: number, volume: number) {
    const source = context.createOscillator(), gain = context.createGain()
    source.type = type; source.frequency.setValueAtTime(frequency, at); source.frequency.exponentialRampToValueAtTime(end, at + duration)
    gain.gain.setValueAtTime(0.001, at); gain.gain.exponentialRampToValueAtTime(volume, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration)
    source.connect(gain); gain.connect(master); source.start(at); source.stop(at + duration)
    sources.push(source); nodes.push(source, gain)
  }
  function noise(frequency: number, at: number, duration: number, volume: number) {
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain()
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
    const samples = buffer.getChannelData(0)
    // Une séquence fixe suffit à produire du souffle sans dépendre du hasard métier.
    let seed = 1977
    for (let index = 0; index < samples.length; index++) {seed = (seed * 16807) % 2147483647; samples[index] = seed / 1073741824 - 1}
    source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 0.7
    gain.gain.setValueAtTime(0.001, at); gain.gain.linearRampToValueAtTime(volume, at + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration)
    source.connect(filter); filter.connect(gain); gain.connect(master); source.start(at); source.stop(at + duration)
    sources.push(source); nodes.push(source, filter, gain)
  }
  return {
    resume: () => context.resume(),
    setVolume(value: number) { master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)) * 0.4, context.currentTime, 0.02) },
    play(clip: AttackClip) {
      stop()
      if (context.state !== 'running') return
      const start = context.currentTime + 0.015, duration = ATTACK_DURATION / 1000
      const launch = start + duration * 0.22, impact = start + duration * 0.65
      if (clip.kind === 'electric') {
        tone('sawtooth', 100, 700, start, duration * 0.25, 0.15)
        noise(4200, launch, duration * 0.5, 0.8)
        tone('square', 900, 160, launch, duration * 0.45, 0.12)
      } else if (clip.kind === 'fire') {
        noise(650, start, duration * 0.88, 1)
        tone('triangle', 90, 45, launch, duration * 0.55, 0.25)
      } else if (clip.kind === 'water') noise(2200, launch, duration * 0.65, 0.8)
      else if (clip.kind === 'vine') {noise(1100, launch, duration * 0.5, 0.6); tone('sine', 340, 80, launch, duration * 0.4, 0.2)}
      else noise(1300, launch, duration * 0.4, 0.5)
      if (clip.outcome === 'hit') {
        tone('sine', 120, 35, impact, duration * 0.3, 0.8)
        noise(clip.kind === 'electric' ? 3200 : 850, impact, duration * 0.2, 0.5)
      }
    },
    stop,
    dispose() {stop(); master.disconnect(); void context.close().catch(() => {})},
  }
}
