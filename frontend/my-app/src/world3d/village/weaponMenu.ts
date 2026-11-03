/** Menu de choix de l'arme : Tab l'ouvre et le ferme, 1 à 3 ou un clic choisissent. */
import type { WeaponId } from './combat'
import { WEAPONS } from './combat'

export function createWeaponMenu(onPick: (weapon: WeaponId) => void) {
    const menu = document.createElement('div')
    menu.className = 'world3d-weapon-menu'
    menu.setAttribute('role', 'dialog')
    menu.setAttribute('aria-label', 'Choix de l’arme')
    menu.hidden = true
    Object.assign(menu.style, {
        position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', minWidth: '280px', padding: '14px',
        borderRadius: '12px', background: 'rgba(12, 18, 28, 0.88)', color: '#f4efe2', font: '14px system-ui, sans-serif',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)', zIndex: '20',
    })
    document.body.appendChild(menu)
    let current: WeaponId = 'fists'

    function draw() {
        menu.innerHTML = '<p style="margin:0 0 10px;font-weight:600">Choisis ton arme <span style="opacity:.6;font-weight:400">· Tab pour fermer</span></p>'
            + WEAPONS.map((weapon) => {
                const chosen = weapon.id === current
                const reach = weapon.range >= 5 ? `portée ${weapon.range} cases` : 'au contact'
                return `<button type="button" data-weapon="${weapon.id}" aria-pressed="${chosen}" style="display:flex;width:100%;gap:10px;align-items:center;`
                    + `margin:4px 0;padding:8px 10px;border-radius:8px;cursor:pointer;text-align:left;font:inherit;color:inherit;`
                    + `border:1px solid ${chosen ? '#e6b33d' : '#3a4352'};background:${chosen ? 'rgba(230,179,61,.18)' : 'transparent'}">`
                    + `<kbd style="min-width:1.4em;text-align:center;border:1px solid #6b7480;border-radius:4px">${weapon.key}</kbd>`
                    + `<span style="flex:1"><b>${weapon.name}</b><br><small style="opacity:.75">${weapon.damage} dégâts · ${reach}</small></span></button>`
            }).join('')
    }
    menu.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-weapon]')
        if (!button) return
        pick(button.dataset.weapon as WeaponId)
        close()
    })

    function pick(weapon: WeaponId) {
        current = weapon
        draw()
        onPick(weapon)
    }
    function close() {
        menu.hidden = true
    }
    draw()

    return {
        get isOpen() { return !menu.hidden },
        toggle() {
            menu.hidden = !menu.hidden
            if (!menu.hidden) draw()
        },
        close,
        /** Choix au clavier (1 à 3), menu ouvert ou non ; faux si la touche ne correspond à aucune arme. */
        pickByKey(key: string) {
            const weapon = WEAPONS.find((candidate) => candidate.key === key)
            if (!weapon) return false
            pick(weapon.id)
            close()
            return true
        },
    }
}
