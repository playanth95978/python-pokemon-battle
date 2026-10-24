import type { Fighter } from './types'
import { effectKind } from './attackPlayback'

interface Props {
    fighter: Fighter;
    label: string;
    selected: number | null;
    disabled: boolean;
    onSelect: (slot: number) => void
}

const icons = {fire: '🔥', water: '💧', vine: '🌿', charge: '✦', electric: '⚡'}

export function AttackPanel({fighter, label, selected, disabled, onSelect}: Props) {
    return <fieldset disabled={disabled} className="attack-panel">
        <legend>{label} : {fighter.species}</legend>
        <div className="moves">
            {fighter.attacks.map((attack) => <label key={attack.slot}
                                                    className={`move move-${effectKind(attack.name)} ${selected === attack.slot ? 'selected' : ''} ${disabled || attack.pp === 0 ? 'unavailable' : ''}`}>
                <input type="radio" name={`attack-${fighter.id}`} value={attack.slot} checked={selected === attack.slot}
                       disabled={attack.pp === 0} onChange={() => onSelect(attack.slot)}/>
                <span><span aria-hidden="true">{icons[effectKind(attack.name)]} </span>{attack.name}
                    <small>{attack.pp} / {attack.max_pp} PP</small></span>
            </label>)}
        </div>
        {fighter.attacks.every((attack) => attack.pp === 0) &&
            <p className="muted text-sm mt-2">Aucune attaque disponible. Lance un nouveau combat.</p>}
    </fieldset>
}
