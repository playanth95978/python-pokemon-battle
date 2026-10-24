import type { Fighter } from './types'

interface Props {
  fighter: Fighter
  label: string
  selected: number | null
  disabled: boolean
  onSelect: (slot: number) => void
}

export function AttackPanel({ fighter, label, selected, disabled, onSelect }: Props) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-3 font-bold">{label} : {fighter.species}</legend>
      <div className="grid gap-2">
        {fighter.attacks.map((attack) => (
          <label key={attack.slot}
            className={`flex items-center gap-3 rounded-lg border-2 p-3 ${attack.pp === 0 || disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${selected === attack.slot ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-white'}`}>
            <input type="radio" name={`attack-${fighter.id}`} value={attack.slot}
              checked={selected === attack.slot} disabled={attack.pp === 0}
              onChange={() => onSelect(attack.slot)} className="accent-blue-700" />
            <span className="min-w-0 flex-1 font-semibold">{attack.name}</span>
            <span className="shrink-0 text-sm">{attack.pp} / {attack.max_pp} PP</span>
          </label>
        ))}
      </div>
      {fighter.attacks.every((attack) => attack.pp === 0) && (
        <p className="mt-2 text-sm text-red-800">Aucune attaque disponible. Lance un nouveau combat.</p>
      )}
    </fieldset>
  )
}
