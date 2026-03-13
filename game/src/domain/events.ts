import type {
  Alignment,
  DomainEventEnvelope,
  EditionId,
  GameId,
  GamePhase,
  GameSubphase,
  IsoTimestamp,
  PlayerId,
  PromptOption,
  PromptVisibility,
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
  | 'ExecutionConsequencesResolved'
  | 'PlayerDied'
  | 'DeadVoteConsumed'
  | 'WakeScheduled'
  | 'WakeConsumed'
  | 'InterruptScheduled'
  | 'InterruptConsumed'
  | 'PromptQueued'
  | 'PromptResolved'
  | 'PromptCancelled'
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
    wake_id: string;
    character_id: string;
    player_id: PlayerId;
  };
}

export interface WakeConsumedEvent extends BaseDomainEvent {
  event_type: 'WakeConsumed';
  payload: {
    wake_id: string;
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
    prompt_id: string;
    kind: string;
    reason: string;
    visibility: PromptVisibility;
    options: PromptOption[];
  };
}

export interface PromptResolvedEvent extends BaseDomainEvent {
  event_type: 'PromptResolved';
  payload: {
    prompt_id: string;
    selected_option_id: string | null;
    freeform: string | null;
    notes: string | null;
  };
}

export interface PromptCancelledEvent extends BaseDomainEvent {
  event_type: 'PromptCancelled';
  payload: {
    prompt_id: string;
    reason: string;
  };
}

export interface StorytellerChoiceMadeEvent extends BaseDomainEvent {
  event_type: 'StorytellerChoiceMade';
  payload: {
    prompt_id: string;
    selected_option_id: string | null;
    freeform: string | null;
  };
}

export interface StorytellerRulingRecordedEvent extends BaseDomainEvent {
  event_type: 'StorytellerRulingRecorded';
  payload: {
    prompt_id: string | null;
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
  | ExecutionConsequencesResolvedEvent
  | PlayerDiedEvent
  | DeadVoteConsumedEvent
  | WakeScheduledEvent
  | WakeConsumedEvent
  | InterruptScheduledEvent
  | InterruptConsumedEvent
  | PromptQueuedEvent
  | PromptResolvedEvent
  | PromptCancelledEvent
  | StorytellerChoiceMadeEvent
  | StorytellerRulingRecordedEvent
  | WinCheckCompletedEvent
  | GameWonEvent
  | ForcedVictoryDeclaredEvent
  | GameEndedEvent;
