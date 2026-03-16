import type { CharacterPlugin, PluginResult } from '../contracts.js';
import {
  build_info_role_misinformation_hooks,
  get_player_information_mode,
  list_players_by_true_character_type
} from './tb-info-utils.js';

const INVESTIGATOR_MINIONS = ['baron', 'poisoner', 'scarlet_woman', 'spy'];

const investigator_info_hooks = build_info_role_misinformation_hooks({
  role_id: 'investigator',
  build_truthful_result: (context): PluginResult => {
    return {
      emitted_events: [
        {
          event_type: 'StorytellerRulingRecorded',
          payload: {
            prompt_key: null,
            note: build_role_pair_note(context.state, context.player_id, 'minion', 'investigator_info')
          }
        }
      ],
      queued_prompts: [],
      queued_interrupts: []
    };
  },
  build_misinformation_selection: ({ context }) => {
    const player_ids = Object.keys(context.state.players_by_id).sort((a, b) => a.localeCompare(b));
    return {
      mode: 'multi_column',
      columns: [INVESTIGATOR_MINIONS, player_ids, player_ids]
    };
  },
  build_misinformation_note: ({ subject_player_id, selected_option_id }) => {
    const parsed = parse_three_column_choice(selected_option_id);
    if (!parsed) {
      return `investigator_info:${subject_player_id}:none_in_play`;
    }
    return `investigator_info:${subject_player_id}:character=${parsed.character_id};players=${parsed.left_player_id},${parsed.right_player_id}`;
  },
  build_truthful_answer: (context) => build_role_pair_note(context.state, context.player_id, 'minion', 'investigator_info')
});

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
    on_night_wake: investigator_info_hooks.on_night_wake,
    on_prompt_resolved: investigator_info_hooks.on_prompt_resolved
  }
};

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
  return {
    character_id,
    left_player_id,
    right_player_id
  };
}
