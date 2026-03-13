import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { find_alive_neighbors, is_functional_player } from './tb-info-utils.js';

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
      const note = is_functional_player(context.state, context.player_id)
        ? `empath_info:${context.player_id}:alive_neighbor_evil_count=${count_evil_neighbors(context.state, context.player_id)}`
        : `empath_info:${context.player_id}:malfunctioning`;

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
