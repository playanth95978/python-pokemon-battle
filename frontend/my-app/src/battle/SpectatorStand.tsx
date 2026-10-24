import type { CrowdReaction } from './crowdReaction'
import { crowdMessages } from './crowdReaction'

export function SpectatorStand({reaction, motion, flat}: {reaction: CrowdReaction; motion: boolean; flat: boolean}) {
  return <>
    {flat && <div className={`crowd-flat crowd-${reaction}${motion ? ' crowd-motion' : ''}`} aria-hidden="true">
      {Array.from({length: 18}, (_, index) => <span className="crowd-person" key={index} style={{color: ['#f2b75a', '#8acdd1', '#ed7b83', '#c5a5eb', '#8fba80'][index % 5], animationDelay: `${-index * 0.13}s`}}><i/><b/><em/></span>)}
    </div>}
    <p className="crowd-status" role="status">{crowdMessages[reaction]}</p>
  </>
}
