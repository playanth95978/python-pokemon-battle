import { useEffect, useState } from 'react'

interface Props {
    species: string;
    action: string;
    opponent: string
}

/** Montre l'action déjà envoyée et le temps écoulé pendant que Mistral décide ; rien n'est résolu ici. */
export function AiThinkingStatus({species, action, opponent}: Props) {
    const [elapsed, setElapsed] = useState(0)

    useEffect(() => {
        const started = Date.now()
        const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
        return () => window.clearInterval(timer)
    }, [])

    return <div className="ai-thinking" role="status">
        <p><strong>{species}</strong> : {action}</p>
        <p className="ai-thinking-line">
            <span className="ai-thinking-dots" aria-hidden="true"><span/><span/><span/></span>
            Mistral réfléchit pour {opponent}…
            {/* Le compteur change chaque seconde : le masquer évite de saturer les lecteurs d'écran. */}
            <span className="muted" aria-hidden="true">{elapsed} s</span>
        </p>
    </div>
}
