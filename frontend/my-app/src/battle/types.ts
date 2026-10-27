export type AttackCategory = 'physical' | 'special' | 'status'
export type AttackTarget = 'opponent' | 'self'
export type StatusCondition = 'paralysis' | 'burn'
export type BattleStat = 'attack' | 'defense' | 'special_attack' | 'special_defense' | 'speed'
export type EffectFailure = 'already_has_status' | 'immune' | 'stat_limit' | 'consecutive_protection'

export interface Attack {
    attack_slot: number;
    name: string;
    pp: number;
    max_pp: number
    category: AttackCategory
    priority: number
    target: AttackTarget
}

export type StatStages = Record<BattleStat, number>

export interface Fighter {
    id: string
    species: string
    level: number
    hp: number
    max_hp: number
    potions: number
    attacks: Attack[]
    status: StatusCondition | null
    stat_stages: StatStages
}

export interface Battle {
    id: string
    turn: number
    first: Fighter
    second: Fighter
    /** null pendant le combat, et aussi après un match nul : se fier à is_over. */
    winner: string | null
    is_over: boolean
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
    | { type: 'battle_ended'; turn: number; winner: string | null }
    | { type: 'fully_paralyzed'; turn: number; actor: string }
    | { type: 'attack_blocked'; turn: number; actor: string; target: string }
    | { type: 'status_applied'; turn: number; actor: string; target: string; condition: StatusCondition }
    | { type: 'stat_changed'; turn: number; actor: string; target: string; stat: BattleStat; change: number; stage: number }
    | { type: 'protection_activated'; turn: number; actor: string }
    | { type: 'effect_failed'; turn: number; actor: string; target: string; reason: EffectFailure; stat?: BattleStat | null; stage?: number | null }
    | { type: 'burn_damage'; turn: number; fighter: string; damage: number; hp_remaining: number }

export interface TurnResponse {
    battle: Battle;
    events: BattleEvent[]
    decision?: { action_type: 'attack' | 'potion'; attack_slot: number | null; source: 'llm' | 'local'; comment: string; fallback_reason: string | null }
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
