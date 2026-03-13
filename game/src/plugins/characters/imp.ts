import type { CharacterPlugin, PluginResult } from '../contracts.js';

const IMP_PROMPT_PREFIX = 'plugin:imp:night_kill';

export const imp_plugin: CharacterPlugin = {
  metadata: {
    id: 'imp',
    name: 'Imp',
    type: 'demon',
    alignment_at_start: 'evil',
    timing_category: 'each_night_except_first',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 1,
      max_targets: 1,
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
      may_change_character: true,
      may_register_as_other: false
    }
  },
  hooks: {
    on_night_wake: (context): PluginResult => {
      const options = Object.values(context.state.players_by_id)
        .filter((player) => player.alive && player.player_id !== context.player_id)
        .map((player) => ({
          option_id: player.player_id,
          label: player.display_name
        }));

      return {
        emitted_events: [],
        queued_prompts: [
          {
            prompt_id: `${IMP_PROMPT_PREFIX}:${context.state.night_number}:${context.player_id}`,
            kind: 'choice',
            reason: 'plugin:imp:choose night kill target',
            visibility: 'storyteller',
            options
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      if (!context.prompt_id.startsWith(IMP_PROMPT_PREFIX)) {
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

      return {
        emitted_events: [
          {
            event_type: 'PlayerDied',
            payload: {
              player_id: context.selected_option_id,
              day_number: context.state.day_number,
              night_number: context.state.night_number,
              reason: 'night_death'
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

export function is_imp_prompt_id(prompt_id: string): boolean {
  return prompt_id.startsWith(IMP_PROMPT_PREFIX);
}
