import type {
  Alignment,
  PlayerCharacterType,
  CommandId,
  GamePhase,
  GameSubphase,
  PlayerId,
  PromptColumnSpec,
  PromptOption,
  PromptRangeSpec,
  PromptSelectionMode,
  PromptVisibility,
  ReminderEffect,
  ReminderExpiryPolicy,
  ReminderTargetScope
} from './types.js';

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
  | 'ResolveExecutionConsequences'
  | 'ApplyDeath'
  | 'MarkPlayerSurvivedExecution'
  | 'UseClaimedAbility'
  | 'ApplyPoison'
  | 'ApplyDrunk'
  | 'ApplyReminderMarker'
  | 'ClearReminderMarker'
  | 'ClearReminderMarkersBySelector'
  | 'SweepReminderExpiry'
  | 'CreatePrompt'
  | 'ResolvePrompt'
  | 'CancelPrompt'
  | 'CheckWinConditions'
  | 'DeclareForcedVictory'
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
    true_character_type?: PlayerCharacterType;
    is_demon?: boolean;
    is_traveller?: boolean;
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

export interface ResolveExecutionConsequencesCommand extends BaseCommand {
  command_type: 'ResolveExecutionConsequences';
  payload: {
    day_number: number;
  };
}

export interface ApplyDeathCommand extends BaseCommand {
  command_type: 'ApplyDeath';
  payload: {
    player_id: PlayerId;
    reason: 'execution' | 'night_death' | 'ability' | 'storyteller';
    day_number: number;
    night_number: number;
  };
}

export interface MarkPlayerSurvivedExecutionCommand extends BaseCommand {
  command_type: 'MarkPlayerSurvivedExecution';
  payload: {
    player_id: PlayerId;
    day_number: number;
  };
}

export interface UseClaimedAbilityCommand extends BaseCommand {
  command_type: 'UseClaimedAbility';
  payload: {
    claimant_player_id: PlayerId;
    claimed_character_id: string;
  };
}

export interface ApplyPoisonCommand extends BaseCommand {
  command_type: 'ApplyPoison';
  payload: {
    marker_id: string;
    kind: string;
    note?: string;
    source_player_id: PlayerId | null;
    source_character_id: string;
    target_player_id: PlayerId;
    day_number: number;
    night_number: number;
  };
}

export interface ApplyDrunkCommand extends BaseCommand {
  command_type: 'ApplyDrunk';
  payload: {
    marker_id: string;
    kind: string;
    note?: string;
    source_player_id: PlayerId | null;
    source_character_id: string;
    target_player_id: PlayerId;
    day_number: number;
    night_number: number;
  };
}

export interface ApplyReminderMarkerCommand extends BaseCommand {
  command_type: 'ApplyReminderMarker';
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
    source_event_id: string | null;
    metadata: Record<string, unknown>;
  };
}

export interface ClearReminderMarkerCommand extends BaseCommand {
  command_type: 'ClearReminderMarker';
  payload: {
    marker_id: string;
    reason: string;
  };
}

export interface ClearReminderMarkersBySelectorCommand extends BaseCommand {
  command_type: 'ClearReminderMarkersBySelector';
  payload: {
    kind: string | null;
    effect: ReminderEffect | null;
    source_player_id: PlayerId | null;
    source_character_id: string | null;
    target_player_id: PlayerId | null;
    reason: string;
  };
}

export interface SweepReminderExpiryCommand extends BaseCommand {
  command_type: 'SweepReminderExpiry';
  payload: {
    phase: GamePhase;
    subphase: GameSubphase;
    day_number: number;
    night_number: number;
  };
}

export interface CreatePromptCommand extends BaseCommand {
  command_type: 'CreatePrompt';
  payload: {
    prompt_id: string;
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

export interface ResolvePromptCommand extends BaseCommand {
  command_type: 'ResolvePrompt';
  payload: {
    prompt_id: string;
    selected_option_id: string | null;
    freeform: string | null;
    notes: string | null;
  };
}

export interface CancelPromptCommand extends BaseCommand {
  command_type: 'CancelPrompt';
  payload: {
    prompt_id: string;
    reason: string;
  };
}

export interface CheckWinConditionsCommand extends BaseCommand {
  command_type: 'CheckWinConditions';
  payload: {
    day_number: number;
    night_number: number;
  };
}

export interface DeclareForcedVictoryCommand extends BaseCommand {
  command_type: 'DeclareForcedVictory';
  payload: {
    winning_team: Alignment;
    rationale: string;
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
  | ResolveExecutionConsequencesCommand
  | ApplyDeathCommand
  | MarkPlayerSurvivedExecutionCommand
  | UseClaimedAbilityCommand
  | ApplyPoisonCommand
  | ApplyDrunkCommand
  | ApplyReminderMarkerCommand
  | ClearReminderMarkerCommand
  | ClearReminderMarkersBySelectorCommand
  | SweepReminderExpiryCommand
  | CreatePromptCommand
  | ResolvePromptCommand
  | CancelPromptCommand
  | CheckWinConditionsCommand
  | DeclareForcedVictoryCommand
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
