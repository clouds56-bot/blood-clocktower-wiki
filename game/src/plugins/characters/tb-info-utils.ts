import type {
  Alignment,
  GameState,
  PlayerCharacterType,
  PlayerState,
  PromptColumnSpec,
  PromptRangeSpec,
  PromptSelectionMode
} from '../../domain/types.js';
import type {
  CharacterPlugin,
  NightWakeHookContext,
  PluginEventSpec,
  PluginPromptSpec,
  PluginResult,
  PromptResolvedHookContext,
  RegistrationQueryHookContext,
  RegistrationQueryHookResult
} from '../contracts.js';
import {
  build_night_prompt_key,
  is_night_prompt_key,
  parse_night_prompt_owner_player_id
} from './prompt-key-utils.js';
import { recluse_plugin } from './recluse.js';
import { spy_plugin } from './spy.js';

export type PlayerInformationMode = 'inactive' | 'truthful' | 'misinformation';

export function get_player_information_mode(
  state: Readonly<GameState>,
  player_id: string
): PlayerInformationMode {
  // Info roles still wake when drunk/poisoned, but should get Storyteller-selected
  // misinformation rather than hard failure.
  const player = state.players_by_id[player_id];
  if (!player || !player.alive) {
    return 'inactive';
  }
  if (player.drunk || player.poisoned) {
    return 'misinformation';
  }
  return 'truthful';
}

export function is_ability_active(state: Readonly<GameState>, player_id: string): boolean {
  const player = state.players_by_id[player_id];
  return Boolean(player && player.alive && !player.drunk && !player.poisoned);
}

export function build_misinformation_prompt(
  role_id: string,
  subject_player_id: string,
  night_number: number,
  selection: MisinformationSelectionSpec
): PluginPromptSpec {
  let selection_mode: PromptSelectionMode = 'single_choice';
  let options: Array<{ option_id: string; label: string }> = [];
  let number_range: PromptRangeSpec | null = null;
  let multi_columns: PromptColumnSpec[] | null = null;

  if (selection.mode === 'single_choice') {
    selection_mode = 'single_choice';
    options = selection.options;
  } else if (selection.mode === 'number_range') {
    selection_mode = 'number_range';
    number_range = selection.range;
  } else {
    selection_mode = 'multi_column';
    multi_columns = selection.columns;
  }

  const time_key = `n${night_number}`;

  return {
    prompt_key: `plugin:${role_id}:misinfo:${time_key}:${subject_player_id}`,
    kind: 'choice',
    reason: `plugin:${role_id}:choose_misinformation:${time_key}:${subject_player_id}`,
    visibility: 'storyteller',
    options,
    selection_mode,
    number_range,
    multi_columns
  };
}

export function is_misinformation_prompt_id(prompt_key: string, role_id: string): boolean {
  if (prompt_key.startsWith(`plugin:${role_id}:misinfo:`)) {
    return true;
  }
  if (prompt_key.startsWith(`plugin:${role_id}:misinfo_pair:`)) {
    return true;
  }
  return /^plugin:[a-z0-9_-]+:misinfo:n\d+:[a-z0-9_-]+(?:$|:)/.test(prompt_key) &&
    prompt_key.startsWith(`plugin:${role_id}:`);
}

export interface InfoRoleMisinformationConfig {
  role_id: string;
  build_truthful_result: (context: NightWakeHookContext) => PluginResult;
  build_misinformation_selection: (args: {
    context: NightWakeHookContext;
    truthful_answer: string | null;
  }) => MisinformationSelectionSpec;
  build_misinformation_note: (args: {
    subject_player_id: string;
    selected_option_id: string | null;
    prompt_key: string;
    state: Readonly<GameState>;
  }) => string;
  build_truthful_answer?: (context: NightWakeHookContext) => string | null;
  build_inactive_note?: (subject_player_id: string) => string;
}

export type MisinformationSelectionSpec =
  | {
      mode: 'single_choice';
      options: Array<{ option_id: string; label: string }>;
    }
  | {
      mode: 'number_range';
      range: PromptRangeSpec;
    }
  | {
      mode: 'multi_column';
      columns: PromptColumnSpec[];
    };

export function build_info_role_misinformation_hooks(config: InfoRoleMisinformationConfig): {
  on_night_wake: (context: NightWakeHookContext) => PluginResult;
  on_prompt_resolved: (context: PromptResolvedHookContext) => PluginResult;
} {
  return {
    on_night_wake: (context): PluginResult => {
      const info_mode = get_player_information_mode(context.state, context.player_id);
      if (info_mode === 'truthful') {
        return config.build_truthful_result(context);
      }

      if (info_mode === 'misinformation') {
        const truthful_answer = config.build_truthful_answer ? config.build_truthful_answer(context) : null;
        return {
          emitted_events: [],
          queued_prompts: [
            {
              ...build_misinformation_prompt(
                config.role_id,
                context.player_id,
                context.state.night_number,
                config.build_misinformation_selection({
                  context,
                  truthful_answer
                })
              ),
              storyteller_hint: truthful_answer
            }
          ],
          queued_interrupts: []
        };
      }

      const inactive_note = config.build_inactive_note
        ? config.build_inactive_note(context.player_id)
        : `${config.role_id}_info:${context.player_id}:inactive`;

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_key: null,
              note: inactive_note
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      if (!is_misinformation_prompt_id(context.prompt_key, config.role_id)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const subject_player_id = parse_misinfo_prompt_subject_player_id(context.prompt_key);
      if (!subject_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_key: context.prompt_key,
              note: config.build_misinformation_note({
                subject_player_id,
                selected_option_id: context.selected_option_id,
                prompt_key: context.prompt_key,
                state: context.state
              })
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  };
}

function parse_misinfo_prompt_subject_player_id(prompt_key: string): string | null {
  const parts = prompt_key.split(':');
  if (parts.length >= 5 && parts[2] === 'misinfo') {
    return parts[4] ?? null;
  }
  if (parts.length >= 5 && parts[2] === 'misinfo_pair' && /^n\d+$/.test(parts[3] ?? '')) {
    return parts[4] ?? null;
  }
  if (parts.length >= 5 && parts[2] === 'misinfo' && /^n\d+$/.test(parts[3] ?? '')) {
    return parts[4] ?? null;
  }
  return null;
}

export function is_functional_player(state: Readonly<GameState>, player_id: string): boolean {
  return is_ability_active(state, player_id);
}

export interface FirstNightPairInfoConfig {
  role_id: 'washerwoman' | 'librarian' | 'investigator';
  target_type: 'townsfolk' | 'outsider' | 'minion';
  note_prefix: string;
  misinformation_character_ids: string[];
  marker_kinds: {
    shown: string;
    wrong: string;
  };
}

export function build_first_night_pair_info_hooks(config: FirstNightPairInfoConfig): {
  on_night_wake: (context: NightWakeHookContext) => PluginResult;
  on_prompt_resolved: (context: PromptResolvedHookContext) => PluginResult;
} {
  return {
    on_night_wake: (context): PluginResult => {
      const info_mode = get_player_information_mode(context.state, context.player_id);
      if (info_mode === 'inactive') {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_key: null,
                note: `${config.note_prefix}:${context.player_id}:inactive`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const in_play_character_ids = list_in_play_character_ids(context.state, context.player_id, config.target_type);
      if (info_mode === 'truthful' && in_play_character_ids.length === 0) {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_key: null,
                note: `${config.note_prefix}:${context.player_id}:none_in_play`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const player_ids = list_other_player_ids(context.state, context.player_id);
      const character_ids = info_mode === 'truthful'
        ? in_play_character_ids
        : [...config.misinformation_character_ids].sort((a, b) => a.localeCompare(b));
      const verb = info_mode === 'truthful' ? 'choose_info_truth' : 'choose_info_misinfo';

      return {
        emitted_events: [],
        queued_prompts: [
          {
            prompt_key: build_night_prompt_key(config.role_id, verb, context.state.night_number, context.player_id),
            kind: 'choice',
            reason: `plugin:${config.role_id}:choose_info:n${context.state.night_number}:${context.player_id}`,
            visibility: 'storyteller',
            options: [],
            selection_mode: 'multi_column',
            multi_columns: [character_ids, player_ids, player_ids],
            storyteller_hint: build_role_pair_note(
              context.state,
              context.player_id,
              config.target_type,
              config.note_prefix
            )
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      const mode = resolve_pair_prompt_mode(context.prompt_key, config.role_id);
      if (!mode) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const owner_player_id = parse_night_prompt_owner_player_id(
        context.prompt_key,
        config.role_id,
        mode === 'truthful' ? 'choose_info_truth' : 'choose_info_misinfo'
      );
      if (!owner_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const parsed = parse_three_column_choice(context.selected_option_id);
      const has_in_play = list_in_play_character_ids(context.state, owner_player_id, config.target_type).length > 0;
      if (!parsed) {
        if (mode === 'truthful' && !has_in_play) {
          return {
            emitted_events: [
              {
                event_type: 'StorytellerRulingRecorded',
                payload: {
                  prompt_key: context.prompt_key,
                  note: `${config.note_prefix}:${owner_player_id}:none_in_play`
                }
              },
              ...build_clear_pair_marker_events(context.state, config, owner_player_id)
            ],
            queued_prompts: [],
            queued_interrupts: []
          };
        }
        return build_retry_result(context, owner_player_id, config, mode, 'invalid_selection');
      }

      if (mode === 'truthful' && !is_valid_truthful_selection(context.state, owner_player_id, parsed, config.target_type)) {
        return build_retry_result(context, owner_player_id, config, mode, 'invalid_selection');
      }

      const marker_targets = resolve_marker_targets(context.state, parsed, mode);
      const emitted_events = [
        {
          event_type: 'StorytellerRulingRecorded' as const,
          payload: {
            prompt_key: context.prompt_key,
            note:
              `${config.note_prefix}:${owner_player_id}:character=${parsed.character_id};` +
              `players=${parsed.left_player_id},${parsed.right_player_id}`
          }
        },
        ...build_clear_pair_marker_events(context.state, config, owner_player_id),
        build_pair_marker_event({
          marker_id: build_pair_marker_id(config.role_id, context.prompt_key, 'shown'),
          marker_kind: config.marker_kinds.shown,
          marker_note: `${config.role_id} shown candidate`,
          source_player_id: owner_player_id,
          target_player_id: marker_targets.shown_player_id,
          source_prompt_key: context.prompt_key,
          info_character_id: parsed.character_id,
          slot: 'shown'
        }),
        build_pair_marker_event({
          marker_id: build_pair_marker_id(config.role_id, context.prompt_key, 'wrong'),
          marker_kind: config.marker_kinds.wrong,
          marker_note: `${config.role_id} wrong candidate`,
          source_player_id: owner_player_id,
          target_player_id: marker_targets.wrong_player_id,
          source_prompt_key: context.prompt_key,
          info_character_id: parsed.character_id,
          slot: 'wrong'
        })
      ];

      return {
        emitted_events,
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  };
}

function build_retry_result(
  context: PromptResolvedHookContext,
  owner_player_id: string,
  config: FirstNightPairInfoConfig,
  mode: 'truthful' | 'misinformation',
  reason: 'invalid_selection'
): PluginResult {
  const retry_prompt_key = next_retry_prompt_key(context.prompt_key);
  const character_ids = mode === 'truthful'
    ? list_in_play_character_ids(context.state, owner_player_id, config.target_type)
    : [...config.misinformation_character_ids].sort((a, b) => a.localeCompare(b));
  const player_ids = list_other_player_ids(context.state, owner_player_id);

  return {
    emitted_events: [
      {
        event_type: 'StorytellerRulingRecorded',
        payload: {
          prompt_key: context.prompt_key,
          note: `${config.note_prefix}:${owner_player_id}:${reason}:retry`
        }
      }
    ],
    queued_prompts: [
      {
        prompt_key: retry_prompt_key,
        kind: 'choice',
        reason: `plugin:${config.role_id}:retry_info:${reason}`,
        visibility: 'storyteller',
        options: [],
        selection_mode: 'multi_column',
        multi_columns: [character_ids, player_ids, player_ids],
        storyteller_hint: build_role_pair_note(context.state, owner_player_id, config.target_type, config.note_prefix)
      }
    ],
    queued_interrupts: []
  };
}

function resolve_pair_prompt_mode(
  prompt_key: string,
  role_id: FirstNightPairInfoConfig['role_id']
): 'truthful' | 'misinformation' | null {
  if (is_night_prompt_key(prompt_key, role_id, 'choose_info_truth')) {
    return 'truthful';
  }
  if (is_night_prompt_key(prompt_key, role_id, 'choose_info_misinfo')) {
    return 'misinformation';
  }
  return null;
}

function next_retry_prompt_key(prompt_key: string): string {
  const retry_match = /:retry(\d+)$/.exec(prompt_key);
  if (!retry_match) {
    return `${prompt_key}:retry1`;
  }

  const next_index = Number.parseInt(retry_match[1] ?? '0', 10) + 1;
  return prompt_key.replace(/:retry\d+$/, `:retry${next_index}`);
}

function list_other_player_ids(state: Readonly<GameState>, owner_player_id: string): string[] {
  const seat_order_ids = state.seat_order.filter((player_id) => player_id !== owner_player_id);
  const seen = new Set(seat_order_ids);
  const missing = Object.keys(state.players_by_id)
    .filter((player_id) => player_id !== owner_player_id && !seen.has(player_id))
    .sort((a, b) => a.localeCompare(b));
  return [...seat_order_ids, ...missing];
}

function list_in_play_character_ids(
  state: Readonly<GameState>,
  owner_player_id: string,
  target_type: FirstNightPairInfoConfig['target_type']
): string[] {
  const unique_character_ids = new Set<string>();
  for (const player of list_players_by_true_character_type(state, target_type)) {
    if (player.player_id === owner_player_id || !player.true_character_id) {
      continue;
    }
    unique_character_ids.add(player.true_character_id);
  }
  return [...unique_character_ids].sort((a, b) => a.localeCompare(b));
}

function parse_three_column_choice(
  selected_option_id: string | null
): { character_id: string; left_player_id: string; right_player_id: string } | null {
  if (!selected_option_id) {
    return null;
  }
  const [character_id, left_player_id, right_player_id] = selected_option_id.split(',').map((token) => token.trim());
  if (!character_id || !left_player_id || !right_player_id) {
    return null;
  }
  if (left_player_id === right_player_id) {
    return null;
  }
  return {
    character_id,
    left_player_id,
    right_player_id
  };
}

function is_valid_truthful_selection(
  state: Readonly<GameState>,
  owner_player_id: string,
  choice: { character_id: string; left_player_id: string; right_player_id: string },
  target_type: FirstNightPairInfoConfig['target_type']
): boolean {
  if (choice.left_player_id === owner_player_id || choice.right_player_id === owner_player_id) {
    return false;
  }

  const left_player = state.players_by_id[choice.left_player_id];
  const right_player = state.players_by_id[choice.right_player_id];
  if (!left_player || !right_player) {
    return false;
  }

  const in_play = list_in_play_character_ids(state, owner_player_id, target_type);
  if (!in_play.includes(choice.character_id)) {
    return false;
  }

  return left_player.true_character_id === choice.character_id || right_player.true_character_id === choice.character_id;
}

function resolve_marker_targets(
  state: Readonly<GameState>,
  choice: { character_id: string; left_player_id: string; right_player_id: string },
  mode: 'truthful' | 'misinformation'
): { shown_player_id: string; wrong_player_id: string } {
  if (mode === 'misinformation') {
    return {
      shown_player_id: choice.left_player_id,
      wrong_player_id: choice.right_player_id
    };
  }

  const left_player = state.players_by_id[choice.left_player_id];
  const right_player = state.players_by_id[choice.right_player_id];
  if (left_player?.true_character_id === choice.character_id) {
    return {
      shown_player_id: choice.left_player_id,
      wrong_player_id: choice.right_player_id
    };
  }
  if (right_player?.true_character_id === choice.character_id) {
    return {
      shown_player_id: choice.right_player_id,
      wrong_player_id: choice.left_player_id
    };
  }

  return {
    shown_player_id: choice.left_player_id,
    wrong_player_id: choice.right_player_id
  };
}

function build_role_pair_note(
  state: Readonly<GameState>,
  owner_player_id: string,
  target_type: FirstNightPairInfoConfig['target_type'],
  prefix: string
): string {
  const candidates = list_players_by_true_character_type(state, target_type).filter(
    (player) => player.player_id !== owner_player_id
  );
  if (candidates.length === 0) {
    return `${prefix}:${owner_player_id}:none_in_play`;
  }

  const shown = candidates[0];
  if (!shown || !shown.true_character_id) {
    return `${prefix}:${owner_player_id}:none_in_play`;
  }

  const decoy = state.seat_order
    .map((player_id) => state.players_by_id[player_id])
    .find((player) => player && player.player_id !== shown.player_id && player.player_id !== owner_player_id);

  if (!decoy) {
    return `${prefix}:${owner_player_id}:character=${shown.true_character_id};players=${shown.player_id}`;
  }

  return `${prefix}:${owner_player_id}:character=${shown.true_character_id};players=${shown.player_id},${decoy.player_id}`;
}

function build_clear_pair_marker_events(
  state: Readonly<GameState>,
  config: FirstNightPairInfoConfig,
  owner_player_id: string
): PluginEventSpec[] {
  const events: PluginEventSpec[] = [];
  const clearable_kinds = new Set([config.marker_kinds.shown, config.marker_kinds.wrong]);

  for (const marker_id of state.active_reminder_marker_ids) {
    const marker = state.reminder_markers_by_id[marker_id];
    if (!marker || marker.status !== 'active') {
      continue;
    }
    if (marker.source_player_id !== owner_player_id || marker.source_character_id !== config.role_id) {
      continue;
    }
    if (!clearable_kinds.has(marker.kind)) {
      continue;
    }

    events.push({
      event_type: 'ReminderMarkerCleared',
      payload: {
        marker_id: marker.marker_id,
        reason: `${config.role_id}_info_replaced`
      }
    });
  }

  return events;
}

function build_pair_marker_id(role_id: string, prompt_key: string, slot: 'shown' | 'wrong'): string {
  return `plugin:${role_id}:info_marker:${prompt_key}:${slot}`;
}

function build_pair_marker_event(args: {
  marker_id: string;
  marker_kind: string;
  marker_note: string;
  source_player_id: string;
  target_player_id: string;
  source_prompt_key: string;
  info_character_id: string;
  slot: 'shown' | 'wrong';
}): PluginEventSpec {
  return {
    event_type: 'ReminderMarkerApplied',
    payload: {
      marker_id: args.marker_id,
      kind: args.marker_kind,
      effect: 'first_night_info',
      note: args.marker_note,
      source_player_id: args.source_player_id,
      source_character_id: args.marker_kind.split(':')[0] ?? null,
      target_player_id: args.target_player_id,
      target_scope: 'player',
      authoritative: false,
      expires_policy: 'manual',
      expires_at_day_number: null,
      expires_at_night_number: null,
      source_event_id: null,
      metadata: {
        source_prompt_key: args.source_prompt_key,
        info_character_id: args.info_character_id,
        slot: args.slot
      }
    }
  };
}

export interface RegistrationQueryRequest {
  query_id: string;
  consumer_role_id: string;
  query_kind: 'alignment_check' | 'character_type_check' | 'character_check' | 'demon_check';
  subject_player_id: string;
  subject_context_player_ids?: string[];
}

export interface RegistrationPromptPlan {
  emitted_events: PluginEventSpec[];
  queued_prompts: PluginPromptSpec[];
  has_blocking_pending_queries: boolean;
}

export function build_registration_query_id(args: {
  consumer_role_id: string;
  query_kind: RegistrationQueryRequest['query_kind'];
  day_number: number;
  night_number: number;
  subject_player_id: string;
  query_slot: string;
  context_player_ids?: string[];
}): string {
  const context = (args.context_player_ids ?? []).join(',');
  return `reg:${args.consumer_role_id}:${args.query_kind}:d${args.day_number}:n${args.night_number}:${args.subject_player_id}:${args.query_slot}:${context}`;
}

export function resolve_registered_alignment(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): Alignment | null {
  const query = state.registration_queries_by_id[request.query_id];
  if (query && query.status === 'resolved' && query.resolved_alignment) {
    return query.resolved_alignment;
  }

  const player = state.players_by_id[request.subject_player_id];
  if (!player) {
    return null;
  }

  const provider_alignment = resolve_provider_registration(state, request)?.resolved_alignment ?? null;
  if (provider_alignment !== null) {
    return provider_alignment;
  }

  return player.registered_alignment ?? player.true_alignment;
}

export function plan_registration_query_prompt(args: {
  state: Readonly<GameState>;
  role_id: string;
  owner_player_id: string;
  context_tag: string;
  requests: RegistrationQueryRequest[];
}): RegistrationPromptPlan {
  const emitted_events: PluginEventSpec[] = [];
  const queued_prompts: PluginPromptSpec[] = [];
  let has_blocking_pending_queries = false;

  for (const request of args.requests) {
    const existing = args.state.registration_queries_by_id[request.query_id];
    if (existing && existing.status === 'resolved') {
      continue;
    }
    if (existing && existing.status === 'pending') {
      has_blocking_pending_queries = true;
      continue;
    }

    const provider_registration = resolve_provider_registration_with_source(args.state, request);
    if (!provider_registration || provider_registration.result.status !== 'needs_storyteller') {
      continue;
    }

    const prompt_options = provider_registration.result.prompt_options ?? [];
    if (prompt_options.length === 0) {
      continue;
    }

    has_blocking_pending_queries = true;

    emitted_events.push({
      event_type: 'RegistrationQueryCreated',
      payload: {
        query_id: request.query_id,
        consumer_role_id: request.consumer_role_id,
        query_kind: request.query_kind,
        subject_player_id: request.subject_player_id,
        subject_context_player_ids: [...(request.subject_context_player_ids ?? [])],
        phase: args.state.phase,
        day_number: args.state.day_number,
        night_number: args.state.night_number
      }
    });
    emitted_events.push({
      event_type: 'StorytellerRulingRecorded',
      payload: {
        prompt_key: null,
        note:
          `registration_query:${request.query_id};provider=${provider_registration.provider_character_id};` +
          `consumer=${args.role_id};subject=${request.subject_player_id};context=${args.context_tag}`
      }
    });

    const registration_prompt_id = build_registration_prompt_id({
        provider_role_id: provider_registration.provider_character_id,
        consumer_role_id: args.role_id,
        owner_player_id: args.owner_player_id,
        context_tag: args.context_tag,
        query_id: request.query_id
      });

    queued_prompts.push({
      prompt_key: registration_prompt_id,
      kind: 'choice',
      reason: `plugin:${args.role_id}:registration adjudication`,
      visibility: 'storyteller',
      options: prompt_options.map((option) => ({
        option_id: option.option_id,
        label: option.label
      })),
      storyteller_hint: provider_registration.result.prompt_hint ?? null
    });
  }

  return {
    emitted_events,
    queued_prompts,
    has_blocking_pending_queries
  };
}

export function resolve_registration_query_prompt(args: {
  state: Readonly<GameState>;
  role_id: string;
  prompt_key: string;
  selected_option_id: string | null;
}): {
  ok: true;
  event: PluginEventSpec;
  parsed: RegistrationPromptDescriptor;
} | {
  ok: false;
} {
  const parsed = parse_registration_prompt_id(args.prompt_key);
  if (!parsed) {
    return { ok: false };
  }
  if (parsed.consumer_role_id !== args.role_id) {
    return { ok: false };
  }

  const selected = args.selected_option_id ?? 'default';
  if (selected === 'default') {
    return {
      ok: true,
      parsed,
      event: {
        event_type: 'RegistrationDecisionRecorded',
        payload: {
          query_id: parsed.query_id,
          resolved_character_id: null,
          resolved_character_type: null,
          resolved_alignment: null,
          decision_source: 'storyteller_prompt',
          note: 'registration_not_triggered'
        }
      }
    };
  }

  if (selected.startsWith('alignment:')) {
    const value = selected.split(':')[1] as Alignment | undefined;
    return {
      ok: true,
      parsed,
      event: {
        event_type: 'RegistrationDecisionRecorded',
        payload: {
          query_id: parsed.query_id,
          resolved_character_id: null,
          resolved_character_type: null,
          resolved_alignment: value ?? null,
          decision_source: 'storyteller_prompt',
          note: `registration_alignment:${value ?? 'null'}`
        }
      }
    };
  }

  if (selected.startsWith('character_type:')) {
    const value = selected.split(':')[1] as PlayerCharacterType | undefined;
    return {
      ok: true,
      parsed,
      event: {
        event_type: 'RegistrationDecisionRecorded',
        payload: {
          query_id: parsed.query_id,
          resolved_character_id: null,
          resolved_character_type: value ?? null,
          resolved_alignment: null,
          decision_source: 'storyteller_prompt',
          note: `registration_character_type:${value ?? 'null'}`
        }
      }
    };
  }

  if (selected.startsWith('character_id:')) {
    const value = selected.slice('character_id:'.length);
    return {
      ok: true,
      parsed,
      event: {
        event_type: 'RegistrationDecisionRecorded',
        payload: {
          query_id: parsed.query_id,
          resolved_character_id: value || null,
          resolved_character_type: null,
          resolved_alignment: null,
          decision_source: 'storyteller_prompt',
          note: `registration_character_id:${value || 'null'}`
        }
      }
    };
  }

  return { ok: false };
}

export function is_registration_query_prompt_id(prompt_key: string, role_id: string): boolean {
  return prompt_key.startsWith('plugin:') && prompt_key.includes(`:registration:${role_id}:`);
}

export interface RegistrationPromptDescriptor {
  provider_role_id: string;
  consumer_role_id: string;
  owner_player_id: string;
  context_tag: string;
  query_id: string;
}

function build_registration_prompt_id(args: {
  provider_role_id: string;
  consumer_role_id: string;
  owner_player_id: string;
  context_tag: string;
  query_id: string;
}): string {
  return `plugin:${args.provider_role_id}:registration:${args.consumer_role_id}:${args.owner_player_id}:${args.context_tag}:${args.query_id}`;
}

export function parse_registration_prompt_id(
  prompt_key: string
): RegistrationPromptDescriptor | null {
  const parts = prompt_key.split(':');
  if (parts.length < 7) {
    return null;
  }
  if (parts[0] !== 'plugin' || parts[2] !== 'registration') {
    return null;
  }

  const provider_role_id = parts[1] ?? '';
  const consumer_role_id = parts[3] ?? '';
  const owner_player_id = parts[4] ?? '';
  const context_tag = parts[5] ?? '';
  const query_id = parts.slice(6).join(':');
  if (!provider_role_id || !consumer_role_id || !owner_player_id || !context_tag || !query_id) {
    return null;
  }

  return {
    provider_role_id,
    consumer_role_id,
    owner_player_id,
    context_tag,
    query_id
  };
}

export function resolve_registered_character_id(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): string | null {
  const query = state.registration_queries_by_id[request.query_id];
  if (query && query.status === 'resolved' && query.resolved_character_id) {
    return query.resolved_character_id;
  }

  const player = state.players_by_id[request.subject_player_id];
  if (!player) {
    return null;
  }

  const provider_character_id = resolve_provider_registration(state, request)?.resolved_character_id ?? null;
  if (provider_character_id !== null) {
    return provider_character_id;
  }

  return player.registered_character_id ?? player.true_character_id;
}

export function resolve_registered_character_type(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): PlayerCharacterType | null {
  const query = state.registration_queries_by_id[request.query_id];
  if (query && query.status === 'resolved' && query.resolved_character_type) {
    return query.resolved_character_type;
  }

  const provider_type = resolve_provider_registration(state, request)?.resolved_character_type ?? null;
  if (provider_type !== null) {
    return provider_type;
  }

  const registered_character_id = resolve_registered_character_id(state, request);
  if (registered_character_id) {
    const classified = classify_tb_character_type(registered_character_id);
    if (classified) {
      return classified;
    }
  }

  const player_after_registered = state.players_by_id[request.subject_player_id];
  if (!player_after_registered) {
    return null;
  }

  if (player_after_registered.true_character_type) {
    return player_after_registered.true_character_type;
  }

  if (!player_after_registered.true_character_id) {
    return null;
  }

  const true_classified = classify_tb_character_type(player_after_registered.true_character_id);
  if (!true_classified) {
    return null;
  }
  return true_classified;
}

export function resolves_as_evil(state: Readonly<GameState>, request: RegistrationQueryRequest): boolean {
  return resolve_registered_alignment(state, request) === 'evil';
}

export function could_resolve_as_evil(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): boolean {
  const outcomes = collect_possible_registered_alignments(state, request);
  return outcomes.has('evil');
}

export function has_variable_alignment_registration(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): boolean {
  const outcomes = collect_possible_registered_alignments(state, request);
  return outcomes.has('good') && outcomes.has('evil');
}

export function resolves_as_demon(state: Readonly<GameState>, request: RegistrationQueryRequest): boolean {
  if (resolve_registered_character_type(state, request) === 'demon') {
    return true;
  }

  const player = state.players_by_id[request.subject_player_id];
  return Boolean(player && player.is_demon);
}

export function could_resolve_as_demon(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): boolean {
  const player = state.players_by_id[request.subject_player_id];
  if (player && player.is_demon) {
    return true;
  }

  const outcomes = collect_possible_registered_character_types(state, request);
  return outcomes.has('demon');
}

export function has_variable_demon_registration(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): boolean {
  const player = state.players_by_id[request.subject_player_id];
  if (player && player.is_demon) {
    return false;
  }

  const outcomes = collect_possible_registered_character_types(state, request);
  if (!outcomes.has('demon')) {
    return false;
  }
  for (const character_type of outcomes) {
    if (character_type !== 'demon') {
      return true;
    }
  }
  return false;
}

export function has_active_fortune_teller_red_herring(
  state: Readonly<GameState>,
  player_id: string
): boolean {
  return state.active_reminder_marker_ids.some((marker_id) => {
    const marker = state.reminder_markers_by_id[marker_id];
    if (!marker || marker.status !== 'active') {
      return false;
    }
    if (marker.kind !== 'fortune_teller:red_herring') {
      return false;
    }
    return marker.target_player_id === player_id;
  });
}

export function find_alive_neighbors(state: Readonly<GameState>, player_id: string): PlayerState[] {
  const seats = state.seat_order;
  const seat_count = seats.length;
  if (seat_count === 0) {
    return [];
  }

  const index = seats.indexOf(player_id);
  if (index === -1) {
    return [];
  }

  const neighbors: PlayerState[] = [];

  for (let offset = 1; offset < seat_count; offset += 1) {
    const left_index = (index - offset + seat_count) % seat_count;
    const left_player_id = seats[left_index];
    if (!left_player_id) {
      continue;
    }
    const left_player = state.players_by_id[left_player_id];
    if (left_player && left_player.alive) {
      neighbors.push(left_player);
      break;
    }
  }

  for (let offset = 1; offset < seat_count; offset += 1) {
    const right_index = (index + offset) % seat_count;
    const right_player_id = seats[right_index];
    if (!right_player_id) {
      continue;
    }
    const right_player = state.players_by_id[right_player_id];
    if (right_player && right_player.alive) {
      neighbors.push(right_player);
      break;
    }
  }

  return neighbors;
}

export function list_players_by_true_alignment(
  state: Readonly<GameState>,
  alignment: 'good' | 'evil'
): PlayerState[] {
  return state.seat_order
    .map((player_id) => state.players_by_id[player_id])
    .filter((player): player is PlayerState => Boolean(player && player.true_alignment === alignment));
}

export function list_players_by_true_character_type(
  state: Readonly<GameState>,
  character_type: 'townsfolk' | 'outsider' | 'minion' | 'demon'
): PlayerState[] {
  return state.seat_order
    .map((player_id) => state.players_by_id[player_id])
    .filter((player): player is PlayerState => {
      if (!player || !player.true_character_id) {
        return false;
      }
      return classify_tb_character_type(player.true_character_id) === character_type;
    });
}

export function classify_tb_character_type(
  character_id: string
): 'townsfolk' | 'outsider' | 'minion' | 'demon' | null {
  if (TB_TOWNSFOLK.has(character_id)) {
    return 'townsfolk';
  }
  if (TB_OUTSIDERS.has(character_id)) {
    return 'outsider';
  }
  if (TB_MINIONS.has(character_id)) {
    return 'minion';
  }
  if (TB_DEMONS.has(character_id)) {
    return 'demon';
  }
  return null;
}

const TB_TOWNSFOLK: ReadonlySet<string> = new Set([
  'chef',
  'empath',
  'fortune_teller',
  'investigator',
  'librarian',
  'mayor',
  'monk',
  'ravenkeeper',
  'slayer',
  'soldier',
  'undertaker',
  'virgin',
  'washerwoman'
]);

const TB_OUTSIDERS: ReadonlySet<string> = new Set(['butler', 'drunk', 'recluse', 'saint']);

const TB_MINIONS: ReadonlySet<string> = new Set(['baron', 'poisoner', 'scarlet_woman', 'spy']);

const TB_DEMONS: ReadonlySet<string> = new Set(['imp']);

type ProviderRegistrationResolution = {
  provider_character_id: string;
  result: RegistrationQueryHookResult;
};

function resolve_provider_registration(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): RegistrationQueryHookResult | null {
  const resolved = resolve_provider_registration_with_source(state, request);
  return resolved?.result ?? null;
}

function resolve_provider_registration_with_source(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): ProviderRegistrationResolution | null {
  const subject = state.players_by_id[request.subject_player_id];
  if (!subject || !subject.true_character_id) {
    return null;
  }

  const provider = REGISTRATION_PROVIDERS_BY_CHARACTER_ID[subject.true_character_id] ?? null;
  if (!provider || !provider.hooks.on_registration_query) {
    return null;
  }

  const context: RegistrationQueryHookContext = {
    state,
    query_id: request.query_id,
    consumer_role_id: request.consumer_role_id,
    query_kind: request.query_kind,
    subject_player_id: request.subject_player_id,
    subject_context_player_ids: [...(request.subject_context_player_ids ?? [])],
    requested_fields: infer_requested_fields(request.query_kind)
  };

  const result = provider.hooks.on_registration_query(context);
  if (!result) {
    return null;
  }
  return {
    provider_character_id: subject.true_character_id,
    result
  };
}

function collect_possible_registered_alignments(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): Set<Alignment> {
  const outcomes = new Set<Alignment>();
  const subject = state.players_by_id[request.subject_player_id];
  if (!subject) {
    return outcomes;
  }

  const baseline_alignment = subject.registered_alignment ?? subject.true_alignment;
  if (baseline_alignment) {
    outcomes.add(baseline_alignment);
  }

  const query = state.registration_queries_by_id[request.query_id];
  if (query && query.status === 'resolved') {
    if (query.resolved_alignment) {
      return new Set([query.resolved_alignment]);
    }
    return outcomes;
  }

  const provider_result = resolve_provider_registration(state, request);
  if (!provider_result) {
    return outcomes;
  }

  if (provider_result.status === 'resolved') {
    if (provider_result.resolved_alignment) {
      outcomes.add(provider_result.resolved_alignment);
    }
    return outcomes;
  }

  for (const option of provider_result.prompt_options ?? []) {
    if (option.resolved_alignment) {
      outcomes.add(option.resolved_alignment);
    }
  }
  return outcomes;
}

function collect_possible_registered_character_types(
  state: Readonly<GameState>,
  request: RegistrationQueryRequest
): Set<PlayerCharacterType> {
  const outcomes = new Set<PlayerCharacterType>();
  const subject = state.players_by_id[request.subject_player_id];
  if (!subject) {
    return outcomes;
  }

  const baseline_type = infer_baseline_character_type(state, request.subject_player_id);
  if (baseline_type) {
    outcomes.add(baseline_type);
  }

  const query = state.registration_queries_by_id[request.query_id];
  if (query && query.status === 'resolved') {
    if (query.resolved_character_type) {
      return new Set([query.resolved_character_type]);
    }
    if (query.resolved_character_id) {
      const classified = classify_tb_character_type(query.resolved_character_id);
      if (classified) {
        return new Set([classified]);
      }
    }
    return outcomes;
  }

  const provider_result = resolve_provider_registration(state, request);
  if (!provider_result) {
    return outcomes;
  }

  if (provider_result.status === 'resolved') {
    if (provider_result.resolved_character_type) {
      outcomes.add(provider_result.resolved_character_type);
      return outcomes;
    }
    if (provider_result.resolved_character_id) {
      const classified = classify_tb_character_type(provider_result.resolved_character_id);
      if (classified) {
        outcomes.add(classified);
      }
    }
    return outcomes;
  }

  for (const option of provider_result.prompt_options ?? []) {
    if (option.resolved_character_type) {
      outcomes.add(option.resolved_character_type);
      continue;
    }
    if (option.resolved_character_id) {
      const classified = classify_tb_character_type(option.resolved_character_id);
      if (classified) {
        outcomes.add(classified);
      }
    }
  }

  return outcomes;
}

function infer_baseline_character_type(
  state: Readonly<GameState>,
  subject_player_id: string
): PlayerCharacterType | null {
  const subject = state.players_by_id[subject_player_id];
  if (!subject) {
    return null;
  }

  if (subject.true_character_type) {
    return subject.true_character_type;
  }

  if (subject.registered_character_id) {
    const classified = classify_tb_character_type(subject.registered_character_id);
    if (classified) {
      return classified;
    }
  }

  if (!subject.true_character_id) {
    return null;
  }

  return classify_tb_character_type(subject.true_character_id);
}

function infer_requested_fields(
  query_kind: RegistrationQueryRequest['query_kind']
): Array<'alignment' | 'character_id' | 'character_type'> {
  if (query_kind === 'alignment_check') {
    return ['alignment'];
  }
  if (query_kind === 'character_check') {
    return ['character_id'];
  }
  if (query_kind === 'character_type_check') {
    return ['character_type'];
  }
  if (query_kind === 'demon_check') {
    return ['character_type'];
  }
  return ['alignment', 'character_id', 'character_type'];
}

const REGISTRATION_PROVIDERS_BY_CHARACTER_ID: Record<string, CharacterPlugin> = {
  spy: spy_plugin,
  recluse: recluse_plugin
};
