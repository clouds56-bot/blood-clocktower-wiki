import type { CharacterPlugin, PluginResult } from '../contracts.js';
import type { GameState } from '../../domain/types.js';
import {
  build_info_role_misinformation_hooks
} from './tb-info-utils.js';

const chef_info_hooks = build_info_role_misinformation_hooks({
  role_id: 'chef',
  build_truthful_result: (context): PluginResult => {
    return {
      emitted_events: [
        {
          event_type: 'StorytellerRulingRecorded',
          payload: {
            prompt_id: null,
            note: `chef_info:${context.player_id}:adjacent_evil_pairs=${count_adjacent_evil_pairs(context.state)}`
          }
        }
      ],
      queued_prompts: [],
      queued_interrupts: []
    };
  },
  build_misinformation_selection: () => ({
    mode: 'number_range',
    range: {
      min: 0,
      max: 2,
      max_inclusive: true
    }
  }),
  build_misinformation_note: (subject_player_id, selected_option_id) => {
    return `chef_info:${subject_player_id}:adjacent_evil_pairs=${selected_option_id ?? '0'}`;
  }
});

export const chef_plugin: CharacterPlugin = {
  metadata: {
    id: 'chef',
    name: 'Chef',
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
    on_night_wake: chef_info_hooks.on_night_wake,
    on_prompt_resolved: chef_info_hooks.on_prompt_resolved
  }
};

function count_adjacent_evil_pairs(state: Readonly<GameState>): number {
  const seats = state.seat_order;
  if (seats.length < 2) {
    return 0;
  }

  let count = 0;
  for (let i = 0; i < seats.length; i += 1) {
    const current_id = seats[i];
    const next_id = seats[(i + 1) % seats.length];
    if (!current_id || !next_id) {
      continue;
    }

    const current = state.players_by_id[current_id];
    const next = state.players_by_id[next_id];
    if (!current || !next) {
      continue;
    }

    if (current.true_alignment === 'evil' && next.true_alignment === 'evil') {
      count += 1;
    }
  }

  return count;
}
