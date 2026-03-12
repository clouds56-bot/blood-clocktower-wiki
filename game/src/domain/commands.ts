import type { Alignment, CommandId, GamePhase, GameSubphase, PlayerId } from './types.js';

export interface BaseCommand {
  command_id: CommandId;
  command_type: CommandType;
  actor_id?: string;
}

export type CommandType =
  | 'CreateGame'
  | 'SelectScript'
  | 'SelectEdition'
  | 'AddPlayer'
  | 'SetSeatOrder'
  | 'AssignCharacter'
  | 'AssignPerceivedCharacter'
  | 'AssignAlignment'
  | 'AdvancePhase'
  | 'OpenNominationWindow'
  | 'NominatePlayer'
  | 'OpenVote'
  | 'CastVote'
  | 'CloseVote'
  | 'ResolveExecution'
  | 'EndDay';

export interface CreateGameCommand extends BaseCommand {
  command_type: 'CreateGame';
  payload: {
    game_id: string;
    created_at: string;
  };
}

export interface SelectScriptCommand extends BaseCommand {
  command_type: 'SelectScript';
  payload: {
    script_id: string;
  };
}

export interface SelectEditionCommand extends BaseCommand {
  command_type: 'SelectEdition';
  payload: {
    edition_id: string;
  };
}

export interface AddPlayerCommand extends BaseCommand {
  command_type: 'AddPlayer';
  payload: {
    player_id: PlayerId;
    display_name: string;
  };
}

export interface SetSeatOrderCommand extends BaseCommand {
  command_type: 'SetSeatOrder';
  payload: {
    seat_order: PlayerId[];
  };
}

export interface AssignCharacterCommand extends BaseCommand {
  command_type: 'AssignCharacter';
  payload: {
    player_id: PlayerId;
    true_character_id: string;
  };
}

export interface AssignPerceivedCharacterCommand extends BaseCommand {
  command_type: 'AssignPerceivedCharacter';
  payload: {
    player_id: PlayerId;
    perceived_character_id: string;
  };
}

export interface AssignAlignmentCommand extends BaseCommand {
  command_type: 'AssignAlignment';
  payload: {
    player_id: PlayerId;
    true_alignment: Alignment;
  };
}

export interface AdvancePhaseCommand extends BaseCommand {
  command_type: 'AdvancePhase';
  payload: {
    phase: GamePhase;
    subphase: GameSubphase;
    day_number: number;
    night_number: number;
  };
}

export interface OpenNominationWindowCommand extends BaseCommand {
  command_type: 'OpenNominationWindow';
  payload: {
    day_number: number;
  };
}

export interface NominatePlayerCommand extends BaseCommand {
  command_type: 'NominatePlayer';
  payload: {
    nomination_id: string;
    day_number: number;
    nominator_player_id: PlayerId;
    nominee_player_id: PlayerId;
  };
}

export interface OpenVoteCommand extends BaseCommand {
  command_type: 'OpenVote';
  payload: {
    nomination_id: string;
    nominee_player_id: PlayerId;
    opened_by_player_id: PlayerId;
  };
}

export interface CastVoteCommand extends BaseCommand {
  command_type: 'CastVote';
  payload: {
    nomination_id: string;
    voter_player_id: PlayerId;
    in_favor: boolean;
  };
}

export interface CloseVoteCommand extends BaseCommand {
  command_type: 'CloseVote';
  payload: {
    nomination_id: string;
    day_number: number;
  };
}

export interface ResolveExecutionCommand extends BaseCommand {
  command_type: 'ResolveExecution';
  payload: {
    day_number: number;
  };
}

export interface EndDayCommand extends BaseCommand {
  command_type: 'EndDay';
  payload: {
    day_number: number;
  };
}

export type Command =
  | CreateGameCommand
  | SelectScriptCommand
  | SelectEditionCommand
  | AddPlayerCommand
  | SetSeatOrderCommand
  | AssignCharacterCommand
  | AssignPerceivedCharacterCommand
  | AssignAlignmentCommand
  | AdvancePhaseCommand
  | OpenNominationWindowCommand
  | NominatePlayerCommand
  | OpenVoteCommand
  | CastVoteCommand
  | CloseVoteCommand
  | ResolveExecutionCommand
  | EndDayCommand;

export interface CommandValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface CommandValidationResult {
  ok: boolean;
  issues: CommandValidationIssue[];
}
