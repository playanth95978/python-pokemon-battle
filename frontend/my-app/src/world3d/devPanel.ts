/**
 * Panneau de réglages du développement (lil-gui) : heure, météo, caméra et rendu se règlent en direct, sans toucher au
 * code. Chargé par import dynamique sous `import.meta.env.DEV` : absent du build de production.
 */
import GUI from 'lil-gui'
import * as THREE from 'three'
import type { CameraFraming } from './cameraRig'
import type { Weather } from './village/weather'

export interface DevPanelTargets {
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    sun: THREE.DirectionalLight
    weather: Weather
    /** Recul de la caméra dehors pour un zoom de 1, et cadrage qu'il alimente. */
    cameraOffset: THREE.Vector3
    framing: CameraFraming
    /** Heure du village, zoom de la molette et résolution : des variables de main.ts, lues et écrites par accesseurs. */
    hour: { get(): number; set(value: number): void }
    zoom: { get(): number; set(value: number): void }
    resolution: { ratio(): number; pin(ratio: number | null): void }
    rain(hours: number, storm: boolean): void
    simulate(seconds: number): void
    /** Éditeur de mobilier (voir propEditor.ts). */
    editor: { enabled: boolean; changes(): string }
}

export function createDevPanel(targets: DevPanelTargets) {
    const gui = new GUI({title: 'Réglages (dev)', width: 300})
    gui.close()
    // Les touches tapées dans les champs ne doivent pas faire marcher le dresseur.
    gui.domElement.addEventListener('keydown', (event) => event.stopPropagation())

    // Un objet à accesseurs : lil-gui lit et écrit `state[clé]`, les variables de main.ts suivent.
    const state = {
        get hour() { return targets.hour.get() },
        set hour(value: number) { targets.hour.set(value) },
        get zoom() { return targets.zoom.get() },
        set zoom(value: number) { targets.zoom.set(value) },
        hours: 3,
        rain: () => targets.rain(state.hours, false),
        storm: () => targets.rain(state.hours, true),
        clear: () => Object.assign(targets.weather, {left: 0, storm: false}),
        simulate: () => targets.simulate(60),
        obstacles: true,
        autoResolution: true,
        pixelRatio: targets.resolution.ratio(),
    }

    const time = gui.addFolder('Heure et météo')
    time.add(state, 'hour', 0, 23.99, 0.25).name('Heure').listen()
    time.add(state, 'hours', 0.5, 12, 0.5).name('Durée (h de jeu)')
    time.add(state, 'rain').name('Averse')
    time.add(state, 'storm').name('Orage (crue)')
    time.add(state, 'clear').name('Arrêter la pluie')
    time.add(state, 'simulate').name('Avancer la crue de 60 s')
    time.add(targets.weather, 'rain', 0, 1).name('Pluie').listen().disable()
    time.add(targets.weather, 'soak', 0, 1).name('Sol gorgé').listen()
    time.add(targets.weather, 'rise', 0, 1).name('Crue').listen()

    const view = gui.addFolder('Caméra dehors')
    view.add(state, 'zoom', 0.45, 1.8, 0.01).name('Zoom').listen()
    view.add(targets.cameraOffset, 'y', 1, 12, 0.1).name('Hauteur')
    view.add(targets.cameraOffset, 'z', 2, 16, 0.1).name('Recul')
    view.add(targets.framing, 'lookHeight', 0, 3, 0.05).name('Regard (hauteur)')
    view.add(targets.framing, 'lookAhead', 0, 5, 0.1).name('Regard (avance)')
    const reach = targets.framing.reach
    view.add(state, 'obstacles').name('Bute sur les maisons').onChange((on: boolean) => { targets.framing.reach = on ? reach : undefined })

    const render = gui.addFolder('Rendu')
    render.add(targets.renderer, 'toneMappingExposure', 0.2, 2, 0.01).name('Exposition')
    render.add(targets.sun, 'intensity', 0, 6, 0.05).name('Soleil').listen()
    render.add(targets.sun, 'castShadow').name('Ombres du soleil')
    if (targets.scene.fog instanceof THREE.Fog) render.add(targets.scene.fog, 'far', 20, 600, 1).name('Brume (distance)')
    const ratio = render.add(state, 'pixelRatio', 0.4, 2, 0.05).name('Résolution ×').listen()
        .onChange((value: number) => { if (!state.autoResolution) targets.resolution.pin(value) })
    render.add(state, 'autoResolution').name('Résolution automatique').onChange((auto: boolean) => {
        targets.resolution.pin(auto ? null : state.pixelRatio)
    })
    // Le curseur affiche la résolution automatique tant qu'elle pilote.
    const follow = () => {
        if (state.autoResolution) state.pixelRatio = targets.resolution.ratio()
        ratio.updateDisplay()
    }
    setInterval(follow, 500)

    const decor = gui.addFolder('Mobilier')
    const exported = {
        copy: () => {
            const text = targets.editor.changes()
            console.info(text)
            void navigator.clipboard?.writeText(text).catch(() => undefined)
        },
    }
    decor.add(targets.editor, 'enabled').name('Déplacer (clic · R · Échap)')
    decor.add(exported, 'copy').name('Copier les changements')
    return gui
}
