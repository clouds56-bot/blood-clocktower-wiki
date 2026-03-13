import type { DomainEventType } from '../domain/events.js';
import type {
  Alignment,
  GameState,
  PlayerId,
  PromptOption,
  PromptVisibility
} from '../domain/types.js';

export type CharacterType = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller' | 'fabled';

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
  prompt_id: string;
  kind: string;
  reason: string;
  visibility: PromptVisibility;
  options: PromptOption[];
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
  prompt_id: string;
  selected_option_id: string | null;
  freeform: string | null;
}

export interface EventAppliedHookContext {
  state: Readonly<GameState>;
  event_type: DomainEventType;
  event_payload: Record<string, unknown>;
}

export interface CharacterPluginHooks {
  on_night_wake?: (context: NightWakeHookContext) => PluginResult;
  on_prompt_resolved?: (context: PromptResolvedHookContext) => PluginResult;
  on_event_applied?: (context: EventAppliedHookContext) => PluginResult;
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
  const trimmedId = metadata.id.trim();
  const trimmedName = metadata.name.trim();

  if (trimmedId.length === 0) {
    issues.push({
      code: 'plugin_id_required',
      message: 'metadata.id must be a non-empty string',
      path: 'id'
    });
  } else if (metadata.id !== trimmedId) {
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
  } else if (metadata.name !== trimmedName) {
    issues.push({
      code: 'plugin_name_canonical',
      message: 'metadata.name must not include leading or trailing whitespace',
      path: 'name'
    });
  }

  if (!Number.isInteger(metadata.target_constraints.min_targets) || metadata.target_constraints.min_targets < 0) {
    issues.push({
      code: 'invalid_min_targets',
      message: 'target_constraints.min_targets must be an integer >= 0',
      path: 'target_constraints.min_targets'
    });
  }

  if (!Number.isInteger(metadata.target_constraints.max_targets) || metadata.target_constraints.max_targets < 0) {
    issues.push({
      code: 'invalid_max_targets',
      message: 'target_constraints.max_targets must be an integer >= 0',
      path: 'target_constraints.max_targets'
    });
  }

  if (metadata.target_constraints.min_targets > metadata.target_constraints.max_targets) {
    issues.push({
      code: 'target_constraints_range_invalid',
      message: 'target_constraints.min_targets must be <= target_constraints.max_targets',
      path: 'target_constraints'
    });
  }

  return issues;
}
