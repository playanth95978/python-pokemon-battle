export interface Attack {
    attack_slot: number;
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
    potions: number
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
    | { type: 'potion_used'; turn: number; actor: string; healed: number; hp_remaining: number; potions_remaining: number }
    | { type: 'attack_used'; turn: number; actor: string; target: string; attack: string; pp_remaining: number; attack_type?: string | null; attack_slot?: number | null }
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
    decision?: { attack_slot: number; source: 'llm' | 'local'; comment: string; fallback_reason: string | null }
}

export interface BattleChoices {
    first_species: string;
    second_species: string
}

export type BattleAction = {action_type: 'attack'; attack_slot: number} | {action_type: 'potion'}

export interface MoveChoices {
    first_move: number;
    second_move: number
}

export interface ActionChoices {
    first_action: BattleAction;
    second_action: BattleAction
}

export type TurnCommand = (MoveChoices | ActionChoices) & {
    expected_turn: number;
    idempotency_key: string
}

export type AiTurnCommand = ({player_move: number} | {player_action: BattleAction}) & {
    expected_turn: number;
    idempotency_key: string
}
