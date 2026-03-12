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
  domain_events: DomainEventEnvelope[];
}

export interface DomainEventEnvelope {
  event_id: EventId;
  event_type: string;
  created_at: IsoTimestamp;
  actor_id?: string;
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
  | 'alive_player_spent_dead_vote';

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
