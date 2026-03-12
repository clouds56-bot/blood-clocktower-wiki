export type GameId = string;
export type PlayerId = string;
export type ScriptId = string;
export type EditionId = string;
export type EventId = string;
export type CommandId = string;
export type IsoTimestamp = string;

export type GameStatus = 'setup' | 'in_progress' | 'ended';

export type GamePhase = 'setup' | 'first_night' | 'day' | 'night' | 'ended';

export type DaySubphase =
  | 'open_discussion'
  | 'nomination_window'
  | 'vote_in_progress'
  | 'execution_resolution'
  | 'day_end';

export type NightSubphase = 'dusk' | 'night_wake_sequence' | 'immediate_interrupt_resolution' | 'dawn';

export type SetupSubphase = 'idle';
export type EndedSubphase = 'complete';

export type GameSubphase = DaySubphase | NightSubphase | SetupSubphase | EndedSubphase;

export type Alignment = 'good' | 'evil';

export interface NominationRecord {
  nomination_id: string;
  nominator_player_id: PlayerId;
  nominee_player_id: PlayerId;
  day_number: number;
  vote_total: number | null;
  threshold: number | null;
}

export interface ActiveVote {
  nomination_id: string;
  nominee_player_id: PlayerId;
  opened_by_player_id: PlayerId;
  votes_by_player_id: Record<PlayerId, boolean>;
}

export interface DayState {
  has_nominated_today: Record<PlayerId, boolean>;
  has_been_nominated_today: Record<PlayerId, boolean>;
  nominations_today: NominationRecord[];
  active_vote: ActiveVote | null;
  nomination_window_open: boolean;
  execution_attempted_today: boolean;
  execution_occurred_today: boolean;
  executed_player_id: PlayerId | null;
  execution_outcome: 'none' | 'pending' | 'died' | 'survived';
  execution_consequences_resolved_today: boolean;
}

export interface ExecutionRecord {
  day_number: number;
  player_id: PlayerId;
  nomination_id: string;
}

export interface DeathRecord {
  player_id: PlayerId;
  day_number: number;
  night_number: number;
  reason: 'execution' | 'night_death' | 'ability' | 'storyteller';
}

export interface PlayerState {
  player_id: PlayerId;
  display_name: string;
  alive: boolean;
  dead_vote_available: boolean;
  true_character_id: string | null;
  perceived_character_id: string | null;
  true_alignment: Alignment | null;
  registered_character_id: string | null;
  registered_alignment: Alignment | null;
  drunk: boolean;
  poisoned: boolean;
  is_traveller: boolean;
  is_demon: boolean;
}

export interface GameState {
  game_id: GameId;
  script_id: ScriptId | null;
  edition_id: EditionId | null;
  status: GameStatus;
  phase: GamePhase;
  subphase: GameSubphase;
  day_number: number;
  night_number: number;
  players_by_id: Record<PlayerId, PlayerState>;
  seat_order: PlayerId[];
  day_state: DayState;
  execution_history: ExecutionRecord[];
  death_history: DeathRecord[];
  winning_team: Alignment | null;
  end_reason: string | null;
  ended_at_event_id: EventId | null;
  domain_events: DomainEventEnvelope[];
}

export interface DomainEventEnvelope {
  event_id: EventId;
  event_type: string;
  created_at: IsoTimestamp;
  actor_id?: string | undefined;
}

export interface InvariantIssue {
  code: InvariantIssueCode;
  message: string;
  path?: string;
  severity: 'error' | 'warning';
}

export type InvariantIssueCode =
  | 'invalid_day_number'
  | 'invalid_night_number'
  | 'invalid_status'
  | 'invalid_phase'
  | 'invalid_subphase'
  | 'seat_order_player_missing'
  | 'seat_order_duplicate_player'
  | 'player_key_mismatch'
  | 'player_missing_required_field'
  | 'alive_player_spent_dead_vote'
  | 'invalid_phase_subphase_combination'
  | 'active_vote_nomination_missing'
  | 'winning_team_present_before_end'
  | 'ended_game_missing_outcome';

export const VALID_GAME_STATUS: readonly GameStatus[] = ['setup', 'in_progress', 'ended'];

export const VALID_GAME_PHASE: readonly GamePhase[] = ['setup', 'first_night', 'day', 'night', 'ended'];

export const VALID_GAME_SUBPHASE: readonly GameSubphase[] = [
  'open_discussion',
  'nomination_window',
  'vote_in_progress',
  'execution_resolution',
  'day_end',
  'dusk',
  'night_wake_sequence',
  'immediate_interrupt_resolution',
  'dawn',
  'idle',
  'complete'
];

export function create_empty_day_state(): DayState {
  return {
    has_nominated_today: {},
    has_been_nominated_today: {},
    nominations_today: [],
    active_vote: null,
    nomination_window_open: false,
    execution_attempted_today: false,
    execution_occurred_today: false,
    executed_player_id: null,
    execution_outcome: 'none',
    execution_consequences_resolved_today: false
  };
}
