/** L'interpellation reste visible avant tout déplacement du joueur ou retrait des gardes. */
export function createArrestOverlay(options: {onPause: () => void; onRelease: () => void; onResist: () => void}) {
    let dialog: HTMLDialogElement | null = null
    let previousFocus: HTMLElement | null = null

    function dispose() {
        dialog?.close()
        dialog?.remove()
        dialog = null
    }

    return {
        get isOpen() { return dialog !== null },
        open(): boolean {
            if (dialog) return false
            previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
            dialog = document.createElement('dialog')
            dialog.className = 'world3d-arrest'
            dialog.setAttribute('aria-labelledby', 'arrest-title')
            dialog.setAttribute('aria-describedby', 'arrest-description')
            // Le focus sur le titre évite qu'un Espace encore tenu pour attaquer active le bouton au relâchement.
            dialog.innerHTML = '<h2 id="arrest-title" tabindex="-1" autofocus>Interpellé par la garde montée</h2>'
                + '<p id="arrest-description">La garde tente de t’arrêter. Tu peux te rendre ou te défendre.</p>'
                + '<p>En cas de défaite, tu seras conduit en prison. Ta progression au château est conservée.</p>'
                + '<button type="button" data-choice="surrender">Se rendre · aller en prison</button>'
                + '<button type="button" data-choice="resist">Se défendre · duel</button>'
            dialog.addEventListener('cancel', (event) => event.preventDefault())
            for (const button of dialog.querySelectorAll<HTMLButtonElement>('button')) button.addEventListener('click', () => {
                if (!dialog) return
                const resist = button.dataset.choice === 'resist'
                dispose()
                if (resist) options.onResist()
                else options.onRelease()
                if (previousFocus?.isConnected) previousFocus.focus()
            })
            document.body.appendChild(dialog)
            dialog.showModal()
            dialog.querySelector<HTMLElement>('h2')!.focus()
            options.onPause()
            return true
        },
        dispose,
    }
}
