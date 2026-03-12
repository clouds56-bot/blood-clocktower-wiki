import type { Alignment, DomainEventEnvelope, EditionId, GameId, GamePhase, GameSubphase, IsoTimestamp, PlayerId, ScriptId } from './types.js';

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
  | 'PhaseAdvanced';

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

export type DomainEvent =
  | GameCreatedEvent
  | ScriptSelectedEvent
  | EditionSelectedEvent
  | PlayerAddedEvent
  | SeatOrderSetEvent
  | CharacterAssignedEvent
  | PerceivedCharacterAssignedEvent
  | AlignmentAssignedEvent
  | PhaseAdvancedEvent;
