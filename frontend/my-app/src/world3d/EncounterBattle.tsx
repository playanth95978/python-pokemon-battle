import { BattleSession } from '../battle/BattlePage'
import { useBattle } from '../battle/useBattle'
import type { WorldPokemon } from './worldPokemon'
import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'

interface Props {
    opponent: WorldPokemon
    onClose: () => void
}

export function EncounterBattle({ opponent, onClose }: Props) {
    const session = useBattle()
    const busy = session.pending !== null
    const dialogRef = useRef<HTMLElement>(null)

    useEffect(() => { dialogRef.current?.focus() }, [])

    function keepFocusInDialog(event: KeyboardEvent<HTMLElement>) {
        if (event.key !== 'Tab') return
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ))
        if (!controls.length) { event.preventDefault(); event.currentTarget.focus(); return }
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
            event.preventDefault(); first.focus()
        }
    }

    function startBattle() {
        void session.createBattle({
            first_species: 'pikachu',
            second_species: opponent.speciesKey,
        })
    }

    return (
        <section
            ref={dialogRef}
            tabIndex={-1}
            onKeyDown={keepFocusInDialog}
            className="battle-page"
            role="dialog"
            aria-modal="true"
            aria-busy={busy}
            aria-labelledby="encounter-title"
        >
            <h1 id="encounter-title">Une rencontre sauvage !</h1>

            {session.error && (
                <p role="alert">{session.error}</p>
            )}

            {session.notice && (
                <p role="status">{session.notice}</p>
            )}

            {!session.battle && (
                <button
                    type="button"
                    disabled={busy}
                    onClick={startBattle}
                >
                    {busy ? 'Création en cours' : 'Commencer le combat'}
                </button>
            )}

            {session.needsSync && (
                <div>
                    <p>Le résultat du tour doit être vérifié.</p>

                    {session.canRetry && (
                        <button
                            disabled={busy}
                            onClick={() => void session.retryLastTurn()}
                        >
                            Récupérer le résultat
                        </button>
                    )}

                    <button
                        disabled={busy}
                        onClick={() => void session.refresh()}
                    >
                        Relire le combat
                    </button>
                </div>
            )}

            {session.battle && (
                <BattleSession
                    key={session.battle.id}
                    battle={session.battle}
                    events={session.events}
                    busy={busy}
                    needsSync={session.needsSync}
                    playTurn={session.playTurn}
                    playAiTurn={session.playAiTurn}
                />
            )}

            <button
                type="button"
                disabled={busy}
                onClick={onClose}
            >
                Retour à l’exploration
            </button>
        </section>
    )
}
