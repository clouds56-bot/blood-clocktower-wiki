import type { CharacterPlugin, PluginResult } from '../contracts.js';
import {
  build_misinformation_prompt,
  get_player_information_mode,
  is_misinformation_prompt_id
} from './tb-info-utils.js';

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
        return {
          emitted_events: [],
          queued_prompts: [
            build_misinformation_prompt('chef', context.player_id, context.state.night_number, [
              { option_id: '0', label: 'Show 0' },
              { option_id: '1', label: 'Show 1' },
              { option_id: '2', label: 'Show 2' }
            ])
          ],
          queued_interrupts: []
        };
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
    },
    on_prompt_resolved: (context): PluginResult => {
      if (!is_misinformation_prompt_id(context.prompt_id, 'chef')) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const subject_player_id = parse_subject_player_id(context.prompt_id);
      if (!subject_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const selected = context.selected_option_id ?? '0';
      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_id: context.prompt_id,
              note: `chef_info:${subject_player_id}:adjacent_evil_pairs=${selected}`
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

function parse_subject_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  return parts[4] ?? null;
}
