/**
 * Temps passé par le GPU sur une image, mesuré par l'extension WebGL2 `EXT_disjoint_timer_query_webgl2`. Le résultat
 * d'une requête arrive quelques images plus tard : on garde une petite réserve de requêtes et on lit celles qui sont
 * prêtes. Sans l'extension (Firefox, certains pilotes), `milliseconds()` reste `null`.
 */
interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

export function createGpuTimer(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    const extension = 'createQuery' in gl ? gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null : null
    const gl2 = gl as WebGL2RenderingContext
    const pending: WebGLQuery[] = []
    let running: WebGLQuery | null = null
    let smoothed: number | null = null

    function collect() {
        while (pending.length > 0 && gl2.getQueryParameter(pending[0], gl2.QUERY_RESULT_AVAILABLE)) {
            const query = pending.shift()!
            // Une image « disjointe » (changement de fréquence, autre contexte) donne une durée fausse : on l'ignore.
            if (!gl2.getParameter(extension!.GPU_DISJOINT_EXT)) {
                const value = (gl2.getQueryParameter(query, gl2.QUERY_RESULT) as number) / 1e6
                smoothed = smoothed === null ? value : smoothed * 0.9 + value * 0.1
            }
            gl2.deleteQuery(query)
        }
    }

    return {
        begin() {
            // Au-delà de quelques requêtes en vol, le GPU a beaucoup de retard : on saute une mesure plutôt que d'empiler.
            if (!extension || running || pending.length > 4) return
            running = gl2.createQuery()
            if (running) gl2.beginQuery(extension.TIME_ELAPSED_EXT, running)
        },
        end() {
            if (!extension) return
            if (running) {
                gl2.endQuery(extension.TIME_ELAPSED_EXT)
                pending.push(running)
                running = null
            }
            collect()
        },
        milliseconds: () => smoothed,
    }
}
