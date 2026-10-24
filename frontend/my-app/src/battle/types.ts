export interface Attack {
    slot: number;
    name: string;
    pp: number;
    max_pp: number
}

export interface Fighter {
    id: string
    species: string
    level: number
    hp: number
    max_hp: number
    attacks: Attack[]
}

export interface Battle {
    id: string
    turn: number
    first: Fighter
    second: Fighter
    winner: string | null
}

export type BattleEvent =
    | { type: 'attack_used'; turn: number; actor: string; target: string; attack: string; pp_remaining: number }
    | { type: 'attack_missed'; turn: number; actor: string; target: string }
    | {
    type: 'damage_dealt';
    turn: number;
    actor: string;
    target: string;
    damage: number;
    hp_remaining: number;
    effectiveness: number
}
    | { type: 'knocked_out'; turn: number; fighter: string }
    | { type: 'battle_ended'; turn: number; winner: string }

export interface TurnResponse {
    battle: Battle;
    events: BattleEvent[]
}

export interface BattleChoices {
    first_species: string;
    second_species: string
}

export interface MoveChoices {
    first_move: number;
    second_move: number
}

export interface TurnCommand extends MoveChoices {
    expected_turn: number;
    idempotency_key: string
}
