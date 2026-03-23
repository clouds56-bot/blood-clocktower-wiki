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

export type AbilityCategory = 'info' | 'passive' | 'skill' | 'registration';

export type AbilityActivation = 'game_setup' | 'night_wake' | 'claim' | 'triggered' | 'passive';

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
  abilities?: CharacterAbilityMetadata[];
  timing_category: TimingCategory;
  is_once_per_game: boolean;
  target_constraints: TargetConstraints;
  flags: PluginFlags;
}

export interface CharacterAbilityMetadata {
  ability_id: string;
  character_id: string;
  summary: string;
  category: AbilityCategory;
  activation: AbilityActivation[];
  reminders?: string[];
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

export interface PrePlayerDiedHookContext {
  state: Readonly<GameState>;
  target_player_id: PlayerId;
  source_player_id: PlayerId | null;
  source_character_id: string | null;
  day_number: number;
  night_number: number;
  reason: string;
}

export type PrePlayerDiedHookResult =
  | {
      outcome: 'allow';
      emitted_events?: PluginEventSpec[];
    }
  | {
      outcome: 'prevent';
      emitted_events?: PluginEventSpec[];
    }
  | {
      outcome: 'redirect';
      redirected_player_id: PlayerId;
      emitted_events?: PluginEventSpec[];
    }
  | {
      outcome: 'prompt';
      prompt: PluginPromptSpec;
      emitted_events?: PluginEventSpec[];
    };

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
  on_pre_player_died?: (context: PrePlayerDiedHookContext) => PrePlayerDiedHookResult;
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
  issues.push(...validate_target_constraints(targetConstraints, 'target_constraints'));

  const flags = metadata.flags;
  issues.push(...validate_plugin_flags(flags, 'flags'));

  if (Array.isArray(metadata.abilities)) {
    issues.push(...validate_abilities(metadata.abilities, trimmedId));
  } else if (metadata.abilities !== undefined) {
    issues.push({
      code: 'invalid_abilities',
      message: 'abilities must be an array when provided',
      path: 'abilities'
    });
  }

  return issues;
}

function validate_abilities(
  abilities: CharacterAbilityMetadata[],
  expectedCharacterId: string
): PluginValidationIssue[] {
  const issues: PluginValidationIssue[] = [];
  const seenAbilityIds = new Set<string>();

  for (const [index, ability] of abilities.entries()) {
    const basePath = `abilities.${index}`;
    const abilityId = typeof ability.ability_id === 'string' ? ability.ability_id : '';
    const characterId = typeof ability.character_id === 'string' ? ability.character_id : '';
    const summary = typeof ability.summary === 'string' ? ability.summary : '';

    const trimmedAbilityId = abilityId.trim();
    const trimmedCharacterId = characterId.trim();
    const trimmedSummary = summary.trim();

    if (trimmedAbilityId.length === 0) {
      issues.push({
        code: 'ability_id_required',
        message: 'ability_id must be a non-empty string',
        path: `${basePath}.ability_id`
      });
    } else if (abilityId !== trimmedAbilityId) {
      issues.push({
        code: 'ability_id_canonical',
        message: 'ability_id must not include leading or trailing whitespace',
        path: `${basePath}.ability_id`
      });
    } else if (seenAbilityIds.has(trimmedAbilityId)) {
      issues.push({
        code: 'duplicate_ability_id',
        message: `ability_id must be unique within plugin metadata: ${trimmedAbilityId}`,
        path: `${basePath}.ability_id`
      });
    } else {
      seenAbilityIds.add(trimmedAbilityId);
    }

    if (trimmedCharacterId.length === 0) {
      issues.push({
        code: 'ability_character_id_required',
        message: 'character_id must be a non-empty string',
        path: `${basePath}.character_id`
      });
    } else if (characterId !== trimmedCharacterId) {
      issues.push({
        code: 'ability_character_id_canonical',
        message: 'character_id must not include leading or trailing whitespace',
        path: `${basePath}.character_id`
      });
    } else if (expectedCharacterId.length > 0 && trimmedCharacterId !== expectedCharacterId) {
      issues.push({
        code: 'ability_character_id_mismatch',
        message: `character_id must match plugin metadata.id (${expectedCharacterId})`,
        path: `${basePath}.character_id`
      });
    }

    if (trimmedSummary.length === 0) {
      issues.push({
        code: 'ability_summary_required',
        message: 'summary must be a non-empty string',
        path: `${basePath}.summary`
      });
    } else if (summary !== trimmedSummary) {
      issues.push({
        code: 'ability_summary_canonical',
        message: 'summary must not include leading or trailing whitespace',
        path: `${basePath}.summary`
      });
    }

    if (!is_ability_category(ability.category)) {
      issues.push({
        code: 'invalid_ability_category',
        message: 'category must be one of: info, passive, skill, registration',
        path: `${basePath}.category`
      });
    }

    if (!Array.isArray(ability.activation) || ability.activation.length === 0) {
      issues.push({
        code: 'invalid_ability_activation',
        message: 'activation must be a non-empty array',
        path: `${basePath}.activation`
      });
    } else {
      const seenActivations = new Set<AbilityActivation>();
      for (const [activationIndex, activation] of ability.activation.entries()) {
        if (!is_ability_activation(activation)) {
          issues.push({
            code: 'invalid_ability_activation_item',
            message: 'activation item must be one of: game_setup, night_wake, claim, triggered, passive',
            path: `${basePath}.activation.${activationIndex}`
          });
          continue;
        }
        if (seenActivations.has(activation)) {
          issues.push({
            code: 'duplicate_ability_activation',
            message: `activation item duplicated: ${activation}`,
            path: `${basePath}.activation.${activationIndex}`
          });
          continue;
        }
        seenActivations.add(activation);
      }
    }

    if (ability.reminders !== undefined) {
      if (!Array.isArray(ability.reminders)) {
        issues.push({
          code: 'invalid_ability_reminders',
          message: 'reminders must be an array of non-empty strings when provided',
          path: `${basePath}.reminders`
        });
      } else {
        for (const [reminderIndex, reminder] of ability.reminders.entries()) {
          if (typeof reminder !== 'string' || reminder.trim().length === 0 || reminder !== reminder.trim()) {
            issues.push({
              code: 'invalid_ability_reminder_item',
              message: 'reminder item must be a canonical non-empty string',
              path: `${basePath}.reminders.${reminderIndex}`
            });
          }
        }
      }
    }
  }

  return issues;
}

function validate_target_constraints(
  targetConstraints: unknown,
  path: string
): PluginValidationIssue[] {
  const issues: PluginValidationIssue[] = [];

  if (!is_record(targetConstraints)) {
    issues.push({
      code: 'invalid_target_constraints',
      message: 'target_constraints must be an object',
      path
    });
    return issues;
  }

  const minTargets: unknown = targetConstraints.min_targets;
  const maxTargets: unknown = targetConstraints.max_targets;

  if (!is_non_negative_integer(minTargets)) {
    issues.push({
      code: 'invalid_min_targets',
      message: 'target_constraints.min_targets must be an integer >= 0',
      path: `${path}.min_targets`
    });
  }

  if (!is_non_negative_integer(maxTargets)) {
    issues.push({
      code: 'invalid_max_targets',
      message: 'target_constraints.max_targets must be an integer >= 0',
      path: `${path}.max_targets`
    });
  }

  if (is_non_negative_integer(minTargets) && is_non_negative_integer(maxTargets) && minTargets > maxTargets) {
    issues.push({
      code: 'target_constraints_range_invalid',
      message: 'target_constraints.min_targets must be <= target_constraints.max_targets',
      path
    });
  }

  return issues;
}

function validate_plugin_flags(flags: unknown, path: string): PluginValidationIssue[] {
  const issues: PluginValidationIssue[] = [];
  if (!is_record(flags)) {
    issues.push({
      code: 'invalid_plugin_flags',
      message: 'flags must be an object',
      path
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
        path: `${path}.${key}`
      });
    }
  }

  return issues;
}

function is_ability_category(value: unknown): value is AbilityCategory {
  return value === 'info' || value === 'passive' || value === 'skill' || value === 'registration';
}

function is_ability_activation(value: unknown): value is AbilityActivation {
  return (
    value === 'game_setup' ||
    value === 'night_wake' ||
    value === 'claim' ||
    value === 'triggered' ||
    value === 'passive'
  );
}

function is_non_negative_integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
