import type { CharacterPlugin, PluginResult } from '../contracts.js';
import {
  build_night_prompt_key,
  is_night_prompt_key,
  parse_night_prompt_owner_player_id
} from './prompt-key-utils.js';
import {
  get_player_information_mode,
  list_players_by_true_character_type
} from './tb-info-utils.js';

const INVESTIGATOR_MINIONS = ['baron', 'poisoner', 'scarlet_woman', 'spy'];

export const investigator_plugin: CharacterPlugin = {
  metadata: {
    id: 'investigator',
    name: 'Investigator',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'first_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 0,
      max_targets: 0,
      allow_self: false,
      require_alive: true,
      allow_travellers: false
    },
    flags: {
      can_function_while_dead: false,
      can_trigger_on_death: false,
      may_cause_drunkenness: false,
      may_cause_poisoning: false,
      may_change_alignment: false,
      may_change_character: false,
      may_register_as_other: false
    }
  },
  hooks: {
    on_night_wake: (context): PluginResult => {
      const info_mode = get_player_information_mode(context.state, context.player_id);
      if (info_mode === 'inactive') {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_key: null,
                note: `investigator_info:${context.player_id}:inactive`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const player_ids = list_other_player_ids(context.state, context.player_id);
      const character_ids = info_mode === 'truthful'
        ? list_in_play_character_ids(context.state, context.player_id)
        : INVESTIGATOR_MINIONS;

      const prompt_key = info_mode === 'truthful'
        ? build_investigator_truth_prompt_key(context.state.night_number, context.player_id)
        : build_investigator_misinfo_prompt_key(context.state.night_number, context.player_id);

      return {
        emitted_events: [],
        queued_prompts: [
          {
            prompt_key,
            kind: 'choice',
            reason: `plugin:investigator:choose_info:n${context.state.night_number}:${context.player_id}`,
            visibility: 'storyteller',
            options: [],
            selection_mode: 'multi_column',
            multi_columns: [character_ids, player_ids, player_ids],
            storyteller_hint: build_role_pair_note(context.state, context.player_id, 'minion', 'investigator_info')
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      if (!is_investigator_truth_prompt_key(context.prompt_key) && !is_investigator_misinfo_prompt_key(context.prompt_key)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const owner_player_id = parse_night_prompt_owner_player_id(
        context.prompt_key,
        'investigator',
        is_investigator_truth_prompt_key(context.prompt_key) ? 'choose_info_truth' : 'choose_info_misinfo'
      );
      if (!owner_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const parsed = parse_three_column_choice(context.selected_option_id);
      let note = build_role_pair_note(context.state, owner_player_id, 'minion', 'investigator_info');

      if (parsed) {
        const mode: 'truthful' | 'misinformation' = is_investigator_truth_prompt_key(context.prompt_key)
          ? 'truthful'
          : 'misinformation';
        const can_use = mode === 'misinformation' || is_valid_truthful_selection(context.state, owner_player_id, parsed);
        if (can_use) {
          note =
            `investigator_info:${owner_player_id}:character=${parsed.character_id};` +
            `players=${parsed.left_player_id},${parsed.right_player_id}`;
        }
      }

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_key: context.prompt_key,
              note
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

function build_investigator_truth_prompt_key(night_number: number, player_id: string): string {
  return build_night_prompt_key('investigator', 'choose_info_truth', night_number, player_id);
}

function build_investigator_misinfo_prompt_key(night_number: number, player_id: string): string {
  return build_night_prompt_key('investigator', 'choose_info_misinfo', night_number, player_id);
}

function is_investigator_truth_prompt_key(prompt_key: string): boolean {
  return is_night_prompt_key(prompt_key, 'investigator', 'choose_info_truth');
}

function is_investigator_misinfo_prompt_key(prompt_key: string): boolean {
  return is_night_prompt_key(prompt_key, 'investigator', 'choose_info_misinfo');
}

function list_other_player_ids(
  state: Parameters<typeof get_player_information_mode>[0],
  owner_player_id: string
): string[] {
  return Object.keys(state.players_by_id)
    .filter((player_id) => player_id !== owner_player_id)
    .sort((a, b) => a.localeCompare(b));
}

function list_in_play_character_ids(
  state: Parameters<typeof get_player_information_mode>[0],
  owner_player_id: string
): string[] {
  const unique_character_ids = new Set<string>();
  for (const player of list_players_by_true_character_type(state, 'minion')) {
    if (player.player_id === owner_player_id || !player.true_character_id) {
      continue;
    }
    unique_character_ids.add(player.true_character_id);
  }
  return [...unique_character_ids].sort((a, b) => a.localeCompare(b));
}

function build_role_pair_note(
  state: Parameters<typeof get_player_information_mode>[0],
  owner_player_id: string,
  target_type: 'minion',
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
  state: Parameters<typeof get_player_information_mode>[0],
  owner_player_id: string,
  choice: { character_id: string; left_player_id: string; right_player_id: string }
): boolean {
  if (choice.left_player_id === owner_player_id || choice.right_player_id === owner_player_id) {
    return false;
  }

  const left_player = state.players_by_id[choice.left_player_id];
  const right_player = state.players_by_id[choice.right_player_id];
  if (!left_player || !right_player) {
    return false;
  }

  const in_play = list_in_play_character_ids(state, owner_player_id);
  if (!in_play.includes(choice.character_id)) {
    return false;
  }

  return left_player.true_character_id === choice.character_id || right_player.true_character_id === choice.character_id;
}
