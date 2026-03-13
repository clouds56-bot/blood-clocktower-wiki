import type { CharacterPlugin, PluginResult } from '../contracts.js';

const POISONER_PROMPT_PREFIX = 'plugin:poisoner:night_poison';

export const poisoner_plugin: CharacterPlugin = {
  metadata: {
    id: 'poisoner',
    name: 'Poisoner',
    type: 'minion',
    alignment_at_start: 'evil',
    timing_category: 'each_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 1,
      max_targets: 1,
      allow_self: true,
      require_alive: true,
      allow_travellers: false
    },
    flags: {
      can_function_while_dead: false,
      can_trigger_on_death: false,
      may_cause_drunkenness: false,
      may_cause_poisoning: true,
      may_change_alignment: false,
      may_change_character: false,
      may_register_as_other: false
    }
  },
  hooks: {
    on_night_wake: (context): PluginResult => {
      const options = Object.values(context.state.players_by_id)
        .filter((player) => player.alive)
        .map((player) => ({
          option_id: player.player_id,
          label: player.display_name
        }));

      return {
        emitted_events: [],
        queued_prompts: [
          {
            prompt_id: `${POISONER_PROMPT_PREFIX}:${context.state.night_number}:${context.player_id}`,
            kind: 'choice',
            reason: 'plugin:poisoner:choose poison target',
            visibility: 'player',
            options
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      if (!context.prompt_id.startsWith(POISONER_PROMPT_PREFIX)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (context.selected_option_id === null) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const emitted_events: PluginResult['emitted_events'] = Object.values(context.state.players_by_id)
        .filter((player) => player.poisoned && player.player_id !== context.selected_option_id)
        .map((player) => ({
          event_type: 'PoisonCleared',
          payload: {
            player_id: player.player_id,
            source_plugin_id: 'poisoner',
            day_number: context.state.day_number,
            night_number: context.state.night_number
          }
        }));

      const selected_player = context.state.players_by_id[context.selected_option_id];
      if (selected_player && !selected_player.poisoned) {
        emitted_events.push({
          event_type: 'PoisonApplied',
          payload: {
            player_id: context.selected_option_id,
            source_plugin_id: 'poisoner',
            day_number: context.state.day_number,
            night_number: context.state.night_number
          }
        });
      }

      return {
        emitted_events,
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

export function is_poisoner_prompt_id(prompt_id: string): boolean {
  return prompt_id.startsWith(POISONER_PROMPT_PREFIX);
}
