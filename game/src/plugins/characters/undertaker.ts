import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { get_player_information_mode } from './tb-info-utils.js';

export const undertaker_plugin: CharacterPlugin = {
  metadata: {
    id: 'undertaker',
    name: 'Undertaker',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'each_night_except_first',
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
                note: `undertaker_info:${context.player_id}:inactive`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (info_mode === 'misinformation') {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_key: null,
                note: `undertaker_info:${context.player_id}:misinformation_required`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const executed_player_id = context.state.day_state.executed_player_id;
      if (!executed_player_id) {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_key: null,
                note: `undertaker_info:${context.player_id}:no_execution_today`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const executed_player = context.state.players_by_id[executed_player_id];
      const executed_character_id = executed_player?.true_character_id;
      if (!executed_character_id) {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_key: null,
                note: `undertaker_info:${context.player_id}:no_execution_today`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_key: null,
              note: `undertaker_info:${context.player_id}:executed_player=${executed_player_id};character=${executed_character_id}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};
