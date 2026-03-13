import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { is_functional_player } from './tb-info-utils.js';

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
      if (!is_functional_player(context.state, context.player_id)) {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_id: null,
                note: `undertaker_info:${context.player_id}:malfunctioning`
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
                prompt_id: null,
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
                prompt_id: null,
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
              prompt_id: null,
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
