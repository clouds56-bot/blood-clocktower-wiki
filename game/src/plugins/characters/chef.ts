import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { get_player_information_mode } from './tb-info-utils.js';

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
    on_night_wake: (context): PluginResult => {
      const info_mode = get_player_information_mode(context.state, context.player_id);
      let note = `chef_info:${context.player_id}:inactive`;
      if (info_mode === 'truthful') {
        note = `chef_info:${context.player_id}:adjacent_evil_pairs=${count_adjacent_evil_pairs(context.state)}`;
      } else if (info_mode === 'misinformation') {
        // Interactive adjudication: Storyteller supplies legal misinformation.
        note = `chef_info:${context.player_id}:misinformation_required`;
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

function count_adjacent_evil_pairs(state: Parameters<typeof get_player_information_mode>[0]): number {
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
