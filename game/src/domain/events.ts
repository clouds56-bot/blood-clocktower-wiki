import type {
  Alignment,
  DomainEventEnvelope,
  EventId,
  PlayerCharacterType,
  EditionId,
  GameId,
  GamePhase,
  GameSubphase,
  IsoTimestamp,
  PlayerId,
  PromptColumnSpec,
  PromptOption,
  PromptRangeSpec,
  PromptSelectionMode,
  PromptVisibility,
  RegistrationDecisionSource,
  RegistrationQueryKind,
  ReminderEffect,
  ReminderExpiryPolicy,
  ReminderTargetScope,
  ScriptId
} from './types.js';

export interface BaseDomainEvent extends DomainEventEnvelope {
  event_type: DomainEventType;
}

export type DomainEventType =
  | 'GameCreated'
  | 'ScriptSelected'
  | 'EditionSelected'
  | 'PlayerAdded'
  | 'SeatOrderSet'
  | 'CharacterAssigned'
  | 'PerceivedCharacterAssigned'
  | 'AlignmentAssigned'
  | 'PhaseAdvanced'
  | 'NominationWindowOpened'
  | 'NominationMade'
  | 'VoteOpened'
  | 'VoteCast'
  | 'VoteClosed'
  | 'ExecutionResolutionCompleted'
  | 'ExecutionOccurred'
  | 'PlayerExecuted'
  | 'PlayerSurvivedExecution'
  | 'ClaimedAbilityAttempted'
  | 'ExecutionConsequencesResolved'
  | 'PlayerDied'
  | 'ReminderMarkerApplied'
  | 'ReminderMarkerCleared'
  | 'ReminderMarkerExpired'
  | 'DrunkApplied'
  | 'SobrietyRestored'
  | 'HealthRestored'
  | 'PoisonApplied'
  | 'PoisonCleared'
  | 'DeadVoteConsumed'
  | 'WakeScheduled'
  | 'WakeConsumed'
  | 'InterruptScheduled'
  | 'InterruptConsumed'
  | 'PromptQueued'
  | 'PromptResolved'
  | 'PromptCancelled'
  | 'RegistrationQueryCreated'
  | 'RegistrationDecisionRecorded'
  | 'StorytellerChoiceMade'
  | 'StorytellerRulingRecorded'
  | 'WinCheckCompleted'
  | 'GameWon'
  | 'ForcedVictoryDeclared'
  | 'GameEnded';

export interface GameCreatedEvent extends BaseDomainEvent {
  event_type: 'GameCreated';
  payload: {
    game_id: GameId;
    created_at: IsoTimestamp;
  };
}

export interface ScriptSelectedEvent extends BaseDomainEvent {
  event_type: 'ScriptSelected';
  payload: {
    script_id: ScriptId;
  };
}

export interface EditionSelectedEvent extends BaseDomainEvent {
  event_type: 'EditionSelected';
  payload: {
    edition_id: EditionId;
  };
}

export interface PlayerAddedEvent extends BaseDomainEvent {
  event_type: 'PlayerAdded';
  payload: {
    player_id: PlayerId;
    display_name: string;
  };
}

export interface SeatOrderSetEvent extends BaseDomainEvent {
  event_type: 'SeatOrderSet';
  payload: {
    seat_order: PlayerId[];
  };
}

export interface CharacterAssignedEvent extends BaseDomainEvent {
  event_type: 'CharacterAssigned';
  payload: {
    player_id: PlayerId;
    true_character_id: string;
    true_character_type?: PlayerCharacterType;
    is_demon?: boolean;
    is_traveller?: boolean;
  };
}

export interface PerceivedCharacterAssignedEvent extends BaseDomainEvent {
  event_type: 'PerceivedCharacterAssigned';
  payload: {
    player_id: PlayerId;
    perceived_character_id: string;
  };
}

export interface AlignmentAssignedEvent extends BaseDomainEvent {
  event_type: 'AlignmentAssigned';
  payload: {
    player_id: PlayerId;
    true_alignment: Alignment;
  };
}

export interface PhaseAdvancedEvent extends BaseDomainEvent {
  event_type: 'PhaseAdvanced';
  payload: {
    phase: GamePhase;
    subphase: GameSubphase;
    day_number: number;
    night_number: number;
  };
}

export interface NominationWindowOpenedEvent extends BaseDomainEvent {
  event_type: 'NominationWindowOpened';
  payload: {
    day_number: number;
  };
}

export interface NominationMadeEvent extends BaseDomainEvent {
  event_type: 'NominationMade';
  payload: {
    nomination_id: string;
    day_number: number;
    nominator_player_id: PlayerId;
    nominee_player_id: PlayerId;
  };
}

export interface VoteOpenedEvent extends BaseDomainEvent {
  event_type: 'VoteOpened';
  payload: {
    nomination_id: string;
    nominee_player_id: PlayerId;
    opened_by_player_id: PlayerId;
  };
}

export interface VoteCastEvent extends BaseDomainEvent {
  event_type: 'VoteCast';
  payload: {
    nomination_id: string;
    voter_player_id: PlayerId;
    in_favor: boolean;
  };
}

export interface VoteClosedEvent extends BaseDomainEvent {
  event_type: 'VoteClosed';
  payload: {
    nomination_id: string;
    day_number: number;
    vote_total: number;
    threshold: number;
  };
}

export interface ExecutionResolutionCompletedEvent extends BaseDomainEvent {
  event_type: 'ExecutionResolutionCompleted';
  payload: {
    day_number: number;
    had_execution: boolean;
  };
}

export interface ExecutionOccurredEvent extends BaseDomainEvent {
  event_type: 'ExecutionOccurred';
  payload: {
    day_number: number;
    nomination_id: string;
    player_id: PlayerId;
  };
}

export interface PlayerExecutedEvent extends BaseDomainEvent {
  event_type: 'PlayerExecuted';
  payload: {
    day_number: number;
    player_id: PlayerId;
  };
}

export interface PlayerSurvivedExecutionEvent extends BaseDomainEvent {
  event_type: 'PlayerSurvivedExecution';
  payload: {
    day_number: number;
    player_id: PlayerId;
  };
}

export interface ClaimedAbilityAttemptedEvent extends BaseDomainEvent {
  event_type: 'ClaimedAbilityAttempted';
  payload: {
    claimant_player_id: PlayerId;
    claimed_character_id: string;
    target_player_ids: PlayerId[];
  };
}

export interface ExecutionConsequencesResolvedEvent extends BaseDomainEvent {
  event_type: 'ExecutionConsequencesResolved';
  payload:
    | {
        day_number: number;
        outcome: 'none';
        player_id: null;
      }
    | {
        day_number: number;
        outcome: 'died' | 'survived';
        player_id: PlayerId;
      };
}

export interface PlayerDiedEvent extends BaseDomainEvent {
  event_type: 'PlayerDied';
  payload: {
    player_id: PlayerId;
    day_number: number;
    night_number: number;
    reason: 'execution' | 'night_death' | 'ability' | 'storyteller';
    source_player_id: PlayerId | null;
    source_character_id: string | null;
  };
}

export interface ReminderMarkerAppliedEvent extends BaseDomainEvent {
  event_type: 'ReminderMarkerApplied';
  payload: {
    marker_id: string;
    kind: string;
    effect: ReminderEffect;
    note: string;
    source_player_id: PlayerId | null;
    source_character_id: string | null;
    target_player_id: PlayerId | null;
    target_scope: ReminderTargetScope;
    authoritative: boolean;
    expires_policy: ReminderExpiryPolicy;
    expires_at_day_number: number | null;
    expires_at_night_number: number | null;
    source_event_id: EventId | null;
    metadata: Record<string, unknown>;
  };
}

export interface ReminderMarkerClearedEvent extends BaseDomainEvent {
  event_type: 'ReminderMarkerCleared';
  payload: {
    marker_id: string;
    reason: string;
  };
}

export interface ReminderMarkerExpiredEvent extends BaseDomainEvent {
  event_type: 'ReminderMarkerExpired';
  payload: {
    marker_id: string;
    reason: string;
  };
}

export interface DrunkAppliedEvent extends BaseDomainEvent {
  event_type: 'DrunkApplied';
  payload: {
    player_id: PlayerId;
    source_marker_id: string;
    day_number: number;
    night_number: number;
  };
}

export interface SobrietyRestoredEvent extends BaseDomainEvent {
  event_type: 'SobrietyRestored';
  payload: {
    player_id: PlayerId;
    source_marker_id: string;
    day_number: number;
    night_number: number;
  };
}

export interface HealthRestoredEvent extends BaseDomainEvent {
  event_type: 'HealthRestored';
  payload: {
    player_id: PlayerId;
    source_marker_id: string;
    day_number: number;
    night_number: number;
  };
}

export interface PoisonAppliedEvent extends BaseDomainEvent {
  event_type: 'PoisonApplied';
  payload: {
    player_id: PlayerId;
    source_plugin_id: string;
    day_number: number;
    night_number: number;
  };
}

export interface PoisonClearedEvent extends BaseDomainEvent {
  event_type: 'PoisonCleared';
  payload: {
    player_id: PlayerId;
    source_plugin_id: string;
    day_number: number;
    night_number: number;
  };
}

export interface DeadVoteConsumedEvent extends BaseDomainEvent {
  event_type: 'DeadVoteConsumed';
  payload: {
    player_id: PlayerId;
    day_number: number;
  };
}

export interface WakeScheduledEvent extends BaseDomainEvent {
  event_type: 'WakeScheduled';
  payload: {
    wake_key: string;
    character_id: string;
    player_id: PlayerId | null;
  };
}

export interface WakeConsumedEvent extends BaseDomainEvent {
  event_type: 'WakeConsumed';
  payload: {
    wake_key: string;
  };
}

export interface InterruptScheduledEvent extends BaseDomainEvent {
  event_type: 'InterruptScheduled';
  payload: {
    interrupt_id: string;
    kind: string;
    source_plugin_id: string;
    payload: Record<string, unknown>;
  };
}

export interface InterruptConsumedEvent extends BaseDomainEvent {
  event_type: 'InterruptConsumed';
  payload: {
    interrupt_id: string;
  };
}

export interface PromptQueuedEvent extends BaseDomainEvent {
  event_type: 'PromptQueued';
  payload: {
    prompt_key: string;
    kind: string;
    reason: string;
    visibility: PromptVisibility;
    options: PromptOption[];
    selection_mode?: PromptSelectionMode;
    number_range?: PromptRangeSpec | null;
    multi_columns?: PromptColumnSpec[] | null;
    storyteller_hint?: string | null;
  };
}

export interface PromptResolvedEvent extends BaseDomainEvent {
  event_type: 'PromptResolved';
  payload: {
    prompt_key: string;
    selected_option_id: string | null;
    freeform: string | null;
    notes: string | null;
  };
}

export interface PromptCancelledEvent extends BaseDomainEvent {
  event_type: 'PromptCancelled';
  payload: {
    prompt_key: string;
    reason: string;
  };
}

export interface RegistrationQueryCreatedEvent extends BaseDomainEvent {
  event_type: 'RegistrationQueryCreated';
  payload: {
    query_id: string;
    consumer_role_id: string;
    query_kind: RegistrationQueryKind;
    subject_player_id: PlayerId;
    subject_context_player_ids: PlayerId[];
    phase: GamePhase;
    day_number: number;
    night_number: number;
  };
}

export interface RegistrationDecisionRecordedEvent extends BaseDomainEvent {
  event_type: 'RegistrationDecisionRecorded';
  payload: {
    query_id: string;
    resolved_character_id: string | null;
    resolved_character_type: PlayerCharacterType | null;
    resolved_alignment: Alignment | null;
    decision_source: RegistrationDecisionSource;
    note: string | null;
  };
}

export interface StorytellerChoiceMadeEvent extends BaseDomainEvent {
  event_type: 'StorytellerChoiceMade';
  payload: {
    prompt_key: string;
    selected_option_id: string | null;
    freeform: string | null;
  };
}

export interface StorytellerRulingRecordedEvent extends BaseDomainEvent {
  event_type: 'StorytellerRulingRecorded';
  payload: {
    prompt_key: string | null;
    note: string;
  };
}

export interface WinCheckCompletedEvent extends BaseDomainEvent {
  event_type: 'WinCheckCompleted';
  payload: {
    day_number: number;
    night_number: number;
    winner_found: boolean;
  };
}

export interface GameWonEvent extends BaseDomainEvent {
  event_type: 'GameWon';
  payload: {
    winning_team: 'good' | 'evil';
    reason: string;
  };
}

export interface ForcedVictoryDeclaredEvent extends BaseDomainEvent {
  event_type: 'ForcedVictoryDeclared';
  payload: {
    winning_team: 'good' | 'evil';
    rationale: string;
  };
}

export interface GameEndedEvent extends BaseDomainEvent {
  event_type: 'GameEnded';
  payload: {
    winning_team: 'good' | 'evil';
    reason: string;
  };
}

export type DomainEvent =
  | GameCreatedEvent
  | ScriptSelectedEvent
  | EditionSelectedEvent
  | PlayerAddedEvent
  | SeatOrderSetEvent
  | CharacterAssignedEvent
  | PerceivedCharacterAssignedEvent
  | AlignmentAssignedEvent
  | PhaseAdvancedEvent
  | NominationWindowOpenedEvent
  | NominationMadeEvent
  | VoteOpenedEvent
  | VoteCastEvent
  | VoteClosedEvent
  | ExecutionResolutionCompletedEvent
  | ExecutionOccurredEvent
  | PlayerExecutedEvent
  | PlayerSurvivedExecutionEvent
  | ClaimedAbilityAttemptedEvent
  | ExecutionConsequencesResolvedEvent
  | PlayerDiedEvent
  | ReminderMarkerAppliedEvent
  | ReminderMarkerClearedEvent
  | ReminderMarkerExpiredEvent
  | DrunkAppliedEvent
  | SobrietyRestoredEvent
  | HealthRestoredEvent
  | PoisonAppliedEvent
  | PoisonClearedEvent
  | DeadVoteConsumedEvent
  | WakeScheduledEvent
  | WakeConsumedEvent
  | InterruptScheduledEvent
  | InterruptConsumedEvent
  | PromptQueuedEvent
  | PromptResolvedEvent
  | PromptCancelledEvent
  | RegistrationQueryCreatedEvent
  | RegistrationDecisionRecordedEvent
  | StorytellerChoiceMadeEvent
  | StorytellerRulingRecordedEvent
  | WinCheckCompletedEvent
  | GameWonEvent
  | ForcedVictoryDeclaredEvent
  | GameEndedEvent;
