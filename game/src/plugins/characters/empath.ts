import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { find_alive_neighbors, get_player_information_mode } from './tb-info-utils.js';

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
    on_night_wake: (context): PluginResult => {
      const info_mode = get_player_information_mode(context.state, context.player_id);
      let note = `empath_info:${context.player_id}:inactive`;
      if (info_mode === 'truthful') {
        note = `empath_info:${context.player_id}:alive_neighbor_evil_count=${count_evil_neighbors(context.state, context.player_id)}`;
      } else if (info_mode === 'misinformation') {
        note = `empath_info:${context.player_id}:misinformation_required`;
      }

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_id: null,
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

function count_evil_neighbors(
  state: Parameters<typeof find_alive_neighbors>[0],
  player_id: string
): number {
  return find_alive_neighbors(state, player_id).filter((player) => player.true_alignment === 'evil').length;
}
