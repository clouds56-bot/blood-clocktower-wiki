import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { build_ravenkeeper_reveal_prompt } from './ravenkeeper.js';

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
      allow_self: true,
      require_alive: false,
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
            visibility: 'player',
            options
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      const imp_player_id = parse_imp_prompt_owner_player_id(context.prompt_id);
      if (!imp_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const imp_player = context.state.players_by_id[imp_player_id];
      if (!imp_player || !imp_player.alive || imp_player.drunk || imp_player.poisoned) {
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

      const target_player = context.state.players_by_id[context.selected_option_id];
      if (!target_player || !target_player.alive) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const target_is_poisoned_or_drunk = target_player.poisoned || target_player.drunk;
      const target_is_soldier =
        target_player.true_character_id === 'soldier' && !target_is_poisoned_or_drunk;
      const target_protected_by_monk =
        !target_is_poisoned_or_drunk &&
        context.state.active_reminder_marker_ids.some((marker_id) => {
          const marker = context.state.reminder_markers_by_id[marker_id];
          return Boolean(
            marker &&
              marker.status === 'active' &&
              marker.kind === 'monk:safe' &&
              marker.authoritative &&
              marker.target_player_id === context.selected_option_id
          );
        });

      if (target_is_soldier || target_protected_by_monk) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const emitted_events: PluginResult['emitted_events'] = [
        {
          event_type: 'PlayerDied',
          payload: {
            player_id: context.selected_option_id,
            day_number: context.state.day_number,
            night_number: context.state.night_number,
            reason: 'night_death'
          }
        }
      ];

      if (context.selected_option_id === imp_player_id) {
        const transfer_target = find_imp_transfer_target(context.state, imp_player_id);
        if (transfer_target) {
          emitted_events.push(
            {
              event_type: 'CharacterAssigned',
              payload: {
                player_id: imp_player_id,
                true_character_id: imp_player.true_character_id ?? 'imp',
                is_demon: false
              }
            },
            {
              event_type: 'CharacterAssigned',
              payload: {
                player_id: transfer_target.player_id,
                true_character_id: 'imp',
                true_character_type: 'demon',
                is_demon: true
              }
            }
          );
        }
      }

      const queued_prompts: PluginResult['queued_prompts'] = [];
      if (
        target_player.true_character_id === 'ravenkeeper' &&
        !target_player.poisoned &&
        !target_player.drunk
      ) {
        queued_prompts.push(build_ravenkeeper_reveal_prompt(context.state, target_player.player_id));
      }

      return {
        emitted_events,
        queued_prompts,
        queued_interrupts: []
      };
    }
  }
};

export function is_imp_prompt_id(prompt_id: string): boolean {
  return prompt_id.startsWith(IMP_PROMPT_PREFIX);
}

function parse_imp_prompt_owner_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  if (parts.length < 5) {
    return null;
  }
  if (parts[0] !== 'plugin' || parts[1] !== 'imp' || parts[2] !== 'night_kill') {
    return null;
  }
  return parts[4] ?? null;
}

function find_imp_transfer_target(
  state: Parameters<typeof build_ravenkeeper_reveal_prompt>[0],
  imp_player_id: string
): { player_id: string } | null {
  for (const player_id of state.seat_order) {
    const player = state.players_by_id[player_id];
    if (!player || !player.alive) {
      continue;
    }
    if (player.player_id === imp_player_id) {
      continue;
    }
    if (player.true_alignment !== 'evil') {
      continue;
    }
    if (player.true_character_type === 'minion') {
      return { player_id: player.player_id };
    }
    if (player.true_character_type == null && player.true_character_id === 'scarlet_woman') {
      return { player_id: player.player_id };
    }
    if (player.true_character_type == null && player.true_character_id === 'poisoner') {
      return { player_id: player.player_id };
    }
    if (player.true_character_type == null && player.true_character_id === 'baron') {
      return { player_id: player.player_id };
    }
    if (player.true_character_type == null && player.true_character_id === 'spy') {
      return { player_id: player.player_id };
    }
  }
  return null;
}
