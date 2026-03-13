import type { CharacterPlugin, PluginResult } from '../contracts.js';
import {
  build_info_role_misinformation_hooks,
  find_alive_neighbors
} from './tb-info-utils.js';

const empath_info_hooks = build_info_role_misinformation_hooks({
  role_id: 'empath',
  build_truthful_result: (context): PluginResult => {
    return {
      emitted_events: [
        {
          event_type: 'StorytellerRulingRecorded',
          payload: {
            prompt_id: null,
            note: `empath_info:${context.player_id}:alive_neighbor_evil_count=${count_evil_neighbors(context.state, context.player_id)}`
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
    return `empath_info:${subject_player_id}:alive_neighbor_evil_count=${selected_option_id ?? '0'}`;
  }
});

export const empath_plugin: CharacterPlugin = {
  metadata: {
    id: 'empath',
    name: 'Empath',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'each_night',
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
    on_night_wake: empath_info_hooks.on_night_wake,
    on_prompt_resolved: empath_info_hooks.on_prompt_resolved
  }
};

function count_evil_neighbors(
  state: Parameters<typeof find_alive_neighbors>[0],
  player_id: string
): number {
  return find_alive_neighbors(state, player_id).filter((player) => player.true_alignment === 'evil').length;
}
