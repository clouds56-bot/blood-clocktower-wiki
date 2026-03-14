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
  NightWakeHookContext,
  PluginPromptSpec,
  PluginResult,
  PromptResolvedHookContext
} from '../contracts.js';

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

  return {
    prompt_id: `plugin:${role_id}:misinfo:${night_number}:${subject_player_id}`,
    kind: 'choice',
    reason: `plugin:${role_id}:choose misinformation`,
    visibility: 'storyteller',
    options,
    selection_mode,
    number_range,
    multi_columns
  };
}

export function is_misinformation_prompt_id(prompt_id: string, role_id: string): boolean {
  return prompt_id.startsWith(`plugin:${role_id}:misinfo:`);
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
    prompt_id: string;
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
              prompt_id: null,
              note: inactive_note
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      if (!is_misinformation_prompt_id(context.prompt_id, config.role_id)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const subject_player_id = parse_misinfo_prompt_subject_player_id(context.prompt_id);
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
              prompt_id: context.prompt_id,
              note: config.build_misinformation_note({
                subject_player_id,
                selected_option_id: context.selected_option_id,
                prompt_id: context.prompt_id,
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

function parse_misinfo_prompt_subject_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  return parts[4] ?? null;
}

export function is_functional_player(state: Readonly<GameState>, player_id: string): boolean {
  return is_ability_active(state, player_id);
}

export interface RegistrationQueryRequest {
  query_id: string;
  consumer_role_id: string;
  query_kind: 'alignment_check' | 'character_type_check' | 'character_check' | 'demon_check';
  subject_player_id: string;
  subject_context_player_ids?: string[];
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
  return player.registered_alignment ?? player.true_alignment;
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

  const registered_character_id = resolve_registered_character_id(state, request);
  if (registered_character_id) {
    const classified = classify_tb_character_type(registered_character_id);
    if (classified) {
      return classified;
    }
  }

  const player = state.players_by_id[request.subject_player_id];
  if (!player) {
    return null;
  }

  if (player.true_character_type) {
    return player.true_character_type;
  }

  if (!player.true_character_id) {
    return null;
  }

  const true_classified = classify_tb_character_type(player.true_character_id);
  if (!true_classified) {
    return null;
  }
  return true_classified;
}

export function resolves_as_evil(state: Readonly<GameState>, request: RegistrationQueryRequest): boolean {
  return resolve_registered_alignment(state, request) === 'evil';
}

export function resolves_as_demon(state: Readonly<GameState>, request: RegistrationQueryRequest): boolean {
  if (resolve_registered_character_type(state, request) === 'demon') {
    return true;
  }

  const player = state.players_by_id[request.subject_player_id];
  return Boolean(player && player.is_demon);
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
