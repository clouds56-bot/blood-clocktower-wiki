import type { DomainEventType } from '../domain/events.js';
import type {
  Alignment,
  CharacterType,
  GameState,
  PlayerCharacterType,
  PlayerId,
  PromptColumnSpec,
  PromptOption,
  PromptRangeSpec,
  PromptSelectionMode,
  PromptVisibility
} from '../domain/types.js';

export type TimingCategory =
  | 'setup'
  | 'first_night'
  | 'each_night'
  | 'each_night_except_first'
  | 'day'
  | 'on_death'
  | 'passive'
  | 'traveller'
  | 'fabled';

export type AlignmentAtStart = Alignment | 'storyteller_choice';

export interface TargetConstraints {
  min_targets: number;
  max_targets: number;
  allow_self: boolean;
  require_alive: boolean;
  allow_travellers: boolean;
}

export interface PluginFlags {
  can_function_while_dead: boolean;
  can_trigger_on_death: boolean;
  may_cause_drunkenness: boolean;
  may_cause_poisoning: boolean;
  may_change_alignment: boolean;
  may_change_character: boolean;
  may_register_as_other: boolean;
}

export interface CharacterPluginMetadata {
  id: string;
  name: string;
  type: CharacterType;
  alignment_at_start: AlignmentAtStart;
  timing_category: TimingCategory;
  is_once_per_game: boolean;
  target_constraints: TargetConstraints;
  flags: PluginFlags;
}

export interface PluginEventSpec {
  event_type: DomainEventType;
  payload: Record<string, unknown>;
  actor_id?: string;
}

export interface PluginPromptSpec {
  prompt_key: string;
  kind: string;
  reason: string;
  visibility: PromptVisibility;
  options: PromptOption[];
  selection_mode?: PromptSelectionMode;
  number_range?: PromptRangeSpec | null;
  multi_columns?: PromptColumnSpec[] | null;
  storyteller_hint?: string | null;
}

export interface PluginInterruptSpec {
  interrupt_id: string;
  kind: string;
  source_plugin_id: string;
  payload: Record<string, unknown>;
}

export interface PluginResult {
  emitted_events: PluginEventSpec[];
  queued_prompts: PluginPromptSpec[];
  queued_interrupts: PluginInterruptSpec[];
}

export interface NightWakeHookContext {
  state: Readonly<GameState>;
  player_id: PlayerId;
  wake_step_id: string;
}

export interface PromptResolvedHookContext {
  state: Readonly<GameState>;
  prompt_key: string;
  selected_option_id: string | null;
  freeform: string | null;
}

export interface ClaimedAbilityUseHookContext {
  state: Readonly<GameState>;
  claimant_player_id: PlayerId;
  claimed_character_id: string;
}

export interface EventAppliedHookContext {
  state: Readonly<GameState>;
  event_type: DomainEventType;
  event_payload: Record<string, unknown>;
}

export interface NominationMadeHookContext {
  state: Readonly<GameState>;
  nomination_id: string;
  day_number: number;
  nominator_player_id: PlayerId;
  nominee_player_id: PlayerId;
}

export interface VoteCastValidateHookContext {
  state: Readonly<GameState>;
  nomination_id: string;
  voter_player_id: PlayerId;
  in_favor: boolean;
}

export interface PlayerDiedHookContext {
  state: Readonly<GameState>;
  player_id: PlayerId;
  day_number: number;
  night_number: number;
  reason: string;
}

export interface RegistrationQueryHookContext {
  state: Readonly<GameState>;
  query_id: string;
  consumer_role_id: string;
  query_kind: 'alignment_check' | 'character_type_check' | 'character_check' | 'demon_check';
  subject_player_id: PlayerId;
  subject_context_player_ids: PlayerId[];
  requested_fields: Array<'alignment' | 'character_id' | 'character_type'>;
}

export interface RegistrationQueryHookResult {
  status: 'resolved' | 'needs_storyteller';
  resolved_alignment?: Alignment | null;
  resolved_character_id?: string | null;
  resolved_character_type?: PlayerCharacterType | null;
  prompt_options?: Array<{
    option_id: string;
    label: string;
    resolved_alignment?: Alignment | null;
    resolved_character_id?: string | null;
    resolved_character_type?: PlayerCharacterType | null;
  }>;
  prompt_hint?: string | null;
}

export interface RegistrationResolvedHookContext {
  state: Readonly<GameState>;
  prompt_key: string;
  provider_role_id: string;
  consumer_role_id: string;
  owner_player_id: PlayerId;
  context_tag: string;
  query_id: string;
  selected_option_id: string | null;
  freeform: string | null;
  decision: {
    query_id: string;
    resolved_character_id: string | null;
    resolved_character_type: PlayerCharacterType | null;
    resolved_alignment: Alignment | null;
    decision_source: 'storyteller_prompt' | 'deterministic_rule';
    note: string | null;
  };
}

export type VoteCastValidateHookResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export interface CharacterPluginHooks {
  on_claimed_ability_use?: (context: ClaimedAbilityUseHookContext) => PluginResult;
  on_night_wake?: (context: NightWakeHookContext) => PluginResult;
  on_prompt_resolved?: (context: PromptResolvedHookContext) => PluginResult;
  on_registration_resolved?: (context: RegistrationResolvedHookContext) => PluginResult;
  on_event_applied?: (context: EventAppliedHookContext) => PluginResult;
  on_nomination_made?: (context: NominationMadeHookContext) => PluginResult;
  on_vote_cast_validate?: (context: VoteCastValidateHookContext) => VoteCastValidateHookResult;
  on_player_died?: (context: PlayerDiedHookContext) => PluginResult;
  on_registration_query?: (
    context: RegistrationQueryHookContext
  ) => RegistrationQueryHookResult | null;
}

export interface CharacterPlugin {
  metadata: CharacterPluginMetadata;
  hooks: CharacterPluginHooks;
}

export interface PluginValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export function empty_plugin_result(): PluginResult {
  return {
    emitted_events: [],
    queued_prompts: [],
    queued_interrupts: []
  };
}

export function validate_plugin_metadata(metadata: CharacterPluginMetadata): PluginValidationIssue[] {
  const issues: PluginValidationIssue[] = [];
  const id = typeof metadata.id === 'string' ? metadata.id : '';
  const name = typeof metadata.name === 'string' ? metadata.name : '';
  const trimmedId = id.trim();
  const trimmedName = name.trim();

  if (trimmedId.length === 0) {
    issues.push({
      code: 'plugin_id_required',
      message: 'metadata.id must be a non-empty string',
      path: 'id'
    });
  } else if (id !== trimmedId) {
    issues.push({
      code: 'plugin_id_canonical',
      message: 'metadata.id must not include leading or trailing whitespace',
      path: 'id'
    });
  }

  if (trimmedName.length === 0) {
    issues.push({
      code: 'plugin_name_required',
      message: 'metadata.name must be a non-empty string',
      path: 'name'
    });
  } else if (name !== trimmedName) {
    issues.push({
      code: 'plugin_name_canonical',
      message: 'metadata.name must not include leading or trailing whitespace',
      path: 'name'
    });
  }

  const targetConstraints = metadata.target_constraints;
  if (!is_record(targetConstraints)) {
    issues.push({
      code: 'invalid_target_constraints',
      message: 'target_constraints must be an object',
      path: 'target_constraints'
    });
    return issues;
  }

  const minTargets = targetConstraints.min_targets;
  const maxTargets = targetConstraints.max_targets;

  if (!Number.isInteger(minTargets) || minTargets < 0) {
    issues.push({
      code: 'invalid_min_targets',
      message: 'target_constraints.min_targets must be an integer >= 0',
      path: 'target_constraints.min_targets'
    });
  }

  if (!Number.isInteger(maxTargets) || maxTargets < 0) {
    issues.push({
      code: 'invalid_max_targets',
      message: 'target_constraints.max_targets must be an integer >= 0',
      path: 'target_constraints.max_targets'
    });
  }

  if (Number.isInteger(minTargets) && Number.isInteger(maxTargets) && minTargets > maxTargets) {
    issues.push({
      code: 'target_constraints_range_invalid',
      message: 'target_constraints.min_targets must be <= target_constraints.max_targets',
      path: 'target_constraints'
    });
  }

  const flags = metadata.flags;
  if (!is_record(flags)) {
    issues.push({
      code: 'invalid_plugin_flags',
      message: 'flags must be an object',
      path: 'flags'
    });
    return issues;
  }

  const boolean_flag_keys = [
    'can_function_while_dead',
    'can_trigger_on_death',
    'may_cause_drunkenness',
    'may_cause_poisoning',
    'may_change_alignment',
    'may_change_character',
    'may_register_as_other'
  ] as const;

  for (const key of boolean_flag_keys) {
    if (typeof flags[key] !== 'boolean') {
      issues.push({
        code: 'invalid_plugin_flag_type',
        message: `flags.${key} must be a boolean`,
        path: `flags.${key}`
      });
    }
  }

  return issues;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
