import type { CharacterPlugin, PluginResult } from '../contracts.js';

function build_minioninfo_prompt_key(night_number: number): string {
  return `plugin:minioninfo:first_night_info:n${night_number}`;
}

export const minioninfo_plugin: CharacterPlugin = {
  metadata: {
    id: 'minioninfo',
    name: 'Minion Info',
    type: 'fabled',
    alignment_at_start: 'storyteller_choice',
    timing_category: 'first_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 0,
      max_targets: 0,
      allow_self: false,
      require_alive: false,
      allow_travellers: true
    },
    flags: {
      can_function_while_dead: true,
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
      const non_traveller_count = Object.values(context.state.players_by_id).filter(
        (player) => !player.is_traveller
      ).length;
      if (non_traveller_count < 7) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const minion_ids = context.state.seat_order.filter((player_id) => {
        const player = context.state.players_by_id[player_id];
        return Boolean(player && !player.is_traveller && player.true_character_type === 'minion');
      });
      const demon_id = context.state.seat_order.find((player_id) => {
        const player = context.state.players_by_id[player_id];
        return Boolean(player && !player.is_traveller && player.true_character_type === 'demon');
      });

      if (minion_ids.length === 0 || !demon_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_key: build_minioninfo_prompt_key(context.state.night_number),
              note: `minioninfo:demon=${demon_id};minions=${minion_ids.join(',')}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};
