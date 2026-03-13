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

export type CharacterType =
  | 'townsfolk'
  | 'outsider'
  | 'minion'
  | 'demon'
  | 'traveller'
  | 'fabled';

export type PlayerCharacterType = Exclude<CharacterType, 'fabled'>;

export type PromptVisibility = 'storyteller' | 'player' | 'public';

export interface PromptOption {
  option_id: string;
  label: string;
}

export interface PromptResolutionPayload {
  selected_option_id: string | null;
  freeform: string | null;
}

export interface PromptState {
  prompt_id: string;
  kind: string;
  reason: string;
  visibility: PromptVisibility;
  options: PromptOption[];
  status: 'pending' | 'resolved' | 'cancelled';
  created_at_event_id: EventId;
  resolved_at_event_id: EventId | null;
  resolution_payload: PromptResolutionPayload | null;
  notes: string | null;
}

export interface StorytellerNoteRecord {
  note_id: string;
  prompt_id: string | null;
  text: string;
  created_at_event_id: EventId;
}

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

export interface WakeQueueEntry {
  wake_id: string;
  character_id: string;
  player_id: PlayerId;
}

export interface InterruptQueueEntry {
  interrupt_id: string;
  kind: string;
  source_plugin_id: string;
  payload: Record<string, unknown>;
}

export type ReminderEffect = 'poisoned' | 'drunk' | string;

export type ReminderMarkerStatus = 'active' | 'cleared' | 'expired';

export type ReminderTargetScope = 'player' | 'game' | 'pair';

export type ReminderExpiryPolicy =
  | 'manual'
  | 'end_of_day'
  | 'start_of_day'
  | 'end_of_night'
  | 'start_of_night'
  | 'on_source_death'
  | 'on_target_death'
  | 'at_day'
  | 'at_night';

export interface ReminderMarkerState {
  marker_id: string;
  kind: string;
  effect: ReminderEffect;
  note: string;
  status: ReminderMarkerStatus;
  source_player_id: PlayerId | null;
  source_character_id: string | null;
  target_player_id: PlayerId | null;
  target_scope: ReminderTargetScope;
  authoritative: boolean;
  expires_policy: ReminderExpiryPolicy;
  expires_at_day_number: number | null;
  expires_at_night_number: number | null;
  created_at_event_id: EventId;
  cleared_at_event_id: EventId | null;
  source_event_id: EventId | null;
  metadata: Record<string, unknown>;
}

export interface PlayerState {
  player_id: PlayerId;
  display_name: string;
  alive: boolean;
  dead_vote_available: boolean;
  true_character_id: string | null;
  true_character_type?: PlayerCharacterType | null;
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
  wake_queue: WakeQueueEntry[];
  interrupt_queue: InterruptQueueEntry[];
  prompts_by_id: Record<string, PromptState>;
  pending_prompts: string[];
  reminder_markers_by_id: Record<string, ReminderMarkerState>;
  active_reminder_marker_ids: string[];
  storyteller_notes: StorytellerNoteRecord[];
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
  | 'duplicate_wake_queue_id'
  | 'wake_queue_invalid_entry'
  | 'wake_queue_player_missing'
  | 'duplicate_interrupt_queue_id'
  | 'interrupt_queue_invalid_entry'
  | 'duplicate_pending_prompt_id'
  | 'pending_prompt_missing'
  | 'pending_prompt_not_pending'
  | 'resolved_prompt_missing_event_id'
  | 'duplicate_active_reminder_marker_id'
  | 'active_reminder_marker_missing'
  | 'active_reminder_marker_not_active'
  | 'authoritative_reminder_target_missing'
  | 'player_poisoned_status_mismatch'
  | 'player_drunk_status_mismatch'
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
