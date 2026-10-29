import type { createVillageAudio } from './villageAudio'

/** Contrôle persistant : le HUD 3D se redessine souvent, mais ne doit pas interrompre le réglage du volume. */
export function createVillageAudioControls(parent: HTMLElement, audio: ReturnType<typeof createVillageAudio>) {
    const element = document.createElement('section')
    element.className = 'village-audio-controls'
    element.setAttribute('aria-label', 'Son du village')
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-keyshortcuts', 'M')
    const label = document.createElement('label')
    label.textContent = 'Volume du village'
    const slider = document.createElement('input')
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1'
    slider.value = String(Math.round(audio.volume * 100))
    const status = document.createElement('span')
    status.setAttribute('role', 'status')
    label.appendChild(slider)
    element.append(button, label, status)
    parent.appendChild(element)
    function render() {
        button.textContent = audio.enabled ? 'Couper les sons du village · M' : 'Activer les sons du village · M'
        button.setAttribute('aria-pressed', String(audio.enabled))
        button.disabled = !audio.available
        status.textContent = !audio.available ? 'Audio indisponible' : !audio.enabled ? 'Sons désactivés' : audio.paused ? 'Ambiance en pause' : 'Ambiance spatialisée'
        slider.setAttribute('aria-valuetext', `${Math.round(audio.volume * 100)} %`)
    }
    button.addEventListener('click', () => audio.toggle())
    slider.addEventListener('input', () => audio.setVolume(Number(slider.value) / 100))
    const unsubscribe = audio.subscribe(render)
    render()
    return {element, dispose() { unsubscribe(); element.remove() }}
}
