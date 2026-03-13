import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { is_functional_player } from './tb-info-utils.js';

export const spy_plugin: CharacterPlugin = {
  metadata: {
    id: 'spy',
    name: 'Spy',
    type: 'minion',
    alignment_at_start: 'evil',
    timing_category: 'each_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 0,
      max_targets: 0,
      allow_self: true,
      require_alive: true,
      allow_travellers: true
    },
    flags: {
      can_function_while_dead: false,
      can_trigger_on_death: false,
      may_cause_drunkenness: false,
      may_cause_poisoning: false,
      may_change_alignment: false,
      may_change_character: false,
      may_register_as_other: true
    }
  },
  hooks: {
    on_night_wake: (context): PluginResult => {
      if (!is_functional_player(context.state, context.player_id)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const visible_players = context.state.seat_order
        .map((player_id) => context.state.players_by_id[player_id])
        .filter((player) => Boolean(player && player.true_character_id))
        .map((player) => `${player!.player_id}:${player!.true_character_id}`)
        .join(',');

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_id: null,
              note: `spy_grimoire:${context.player_id}:${visible_players}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};
