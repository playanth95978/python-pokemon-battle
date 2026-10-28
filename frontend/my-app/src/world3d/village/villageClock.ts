/** Horloge du village : une journée entière dure douze minutes réelles, soit trente secondes par heure. */
export const DAY_SECONDS = 720
/** Heure au lancement : le marché est ouvert, les enfants jouent sur la place. */
export const START_HOUR = 9

export function advanceHour(hour: number, seconds: number) {
    return (hour + seconds * 24 / DAY_SECONDS) % 24
}

/** « 9 h 05 », pour le HUD. */
export function formatHour(hour: number) {
    const minutes = Math.floor((hour % 1) * 60)
    return `${Math.floor(hour)} h ${String(minutes).padStart(2, '0')}`
}
