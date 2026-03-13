import type { CharacterPlugin, PluginResult } from '../contracts.js';
import {
  build_misinformation_prompt,
  find_alive_neighbors,
  get_player_information_mode,
  is_misinformation_prompt_id
} from './tb-info-utils.js';

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
        return {
          emitted_events: [],
          queued_prompts: [
            build_misinformation_prompt('empath', context.player_id, context.state.night_number, [
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
      if (!is_misinformation_prompt_id(context.prompt_id, 'empath')) {
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
              note: `empath_info:${subject_player_id}:alive_neighbor_evil_count=${selected}`
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

function parse_subject_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  return parts[4] ?? null;
}
