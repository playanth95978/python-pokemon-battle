import type { Fighter } from './types'
import { effectKind } from './attackPlayback'

interface Props {
    fighter: Fighter;
    label: string;
    selected: number | null;
    disabled: boolean;
    onSelect: (attack_slot: number) => void
    potionSelected?: boolean;
    onPotion?: () => void
}

const icons = {fire: '🔥', water: '💧', vine: '🌿', charge: '✦', electric: '⚡'}

export function AttackPanel({fighter, label, selected, disabled, onSelect, potionSelected = false, onPotion}: Props) {
    return <fieldset disabled={disabled} className="attack-panel">
        <legend>{label} : {fighter.species}</legend>
        <div className="moves">
            {fighter.attacks.map((attack) => <label key={attack.attack_slot}
                                                    className={`move move-${effectKind(attack.name)} ${selected === attack.attack_slot ? 'selected' : ''} ${disabled || attack.pp === 0 ? 'unavailable' : ''}`}>
                <input type="radio" name={`attack-${fighter.id}`} value={attack.attack_slot} checked={selected === attack.attack_slot}
                       disabled={attack.pp === 0} onChange={() => onSelect(attack.attack_slot)}/>
                <span><span aria-hidden="true">{icons[effectKind(attack.name)]} </span>{attack.name}
                    <small>{attack.pp} / {attack.max_pp} PP</small></span>
            </label>)}
        </div>
        {onPotion && <button type="button" className="potion-button" aria-pressed={potionSelected}
            disabled={disabled || fighter.potions <= 0 || fighter.hp >= fighter.max_hp || fighter.hp <= 0}
            onClick={onPotion}>Utiliser une potion ({fighter.potions})</button>}
        {onPotion && <p className="muted text-sm">Soigne jusqu’à 20 PV et remplace l’attaque du tour.</p>}
        {fighter.attacks.every((attack) => attack.pp === 0) &&
            <p className="muted text-sm mt-2">Aucune attaque disponible. Lance un nouveau combat.</p>}
    </fieldset>
}
