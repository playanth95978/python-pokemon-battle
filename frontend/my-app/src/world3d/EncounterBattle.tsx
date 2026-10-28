import { BattleSession } from '../battle/BattlePage'
import { useBattle } from '../battle/useBattle'
import type { WorldPokemon } from './worldPokemon'
import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'

/** Ce que l'exploration ajoute à une rencontre : bonus d'objets, titre, réaction à la victoire. */
export interface EncounterOptions {
    title?: string
    /** Niveau et potions du dresseur, avec une phrase qui les explique. */
    bonus?: { first_level: number; first_potions: number; text: string }
    /** Appelé une fois, quand le combat se termine sur la victoire du dresseur. */
    onVictory?: () => void
    victoryText?: string
}

interface Props extends EncounterOptions {
    opponent: WorldPokemon
    onClose: () => void
}

export function EncounterBattle({ opponent, onClose, title, bonus, onVictory, victoryText }: Props) {
    const session = useBattle()
    const busy = session.pending !== null
    const dialogRef = useRef<HTMLElement>(null)
    const battle = session.battle
    const won = !!battle?.is_over && battle.winner === battle.first.id
    const reported = useRef(false)

    useEffect(() => { dialogRef.current?.focus() }, [])
    useEffect(() => {
        if (!won || reported.current) return
        reported.current = true
        onVictory?.()
    }, [won, onVictory])

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
            ...(bonus && {first_level: bonus.first_level, first_potions: bonus.first_potions}),
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
            <h1 id="encounter-title">{title ?? 'Une rencontre sauvage !'}</h1>

            {bonus?.text && !battle && <p>{bonus.text}</p>}

            {won && victoryText && <p role="status"><strong>{victoryText}</strong></p>}

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
