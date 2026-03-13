import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { is_functional_player } from './tb-info-utils.js';

const MONK_PROMPT_PREFIX = 'plugin:monk:night_protect';

export const monk_plugin: CharacterPlugin = {
  metadata: {
    id: 'monk',
    name: 'Monk',
    type: 'townsfolk',
    alignment_at_start: 'good',
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
      may_change_character: false,
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
            prompt_id: `${MONK_PROMPT_PREFIX}:${context.state.night_number}:${context.player_id}`,
            kind: 'choice',
            reason: 'plugin:monk:choose protection target',
            visibility: 'player',
            options
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      const monk_player_id = parse_monk_prompt_owner_player_id(context.prompt_id);
      if (!monk_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (!is_functional_player(context.state, monk_player_id)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (context.selected_option_id === null || context.selected_option_id === monk_player_id) {
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

      const emitted_events: PluginResult['emitted_events'] = context.state.active_reminder_marker_ids
        .map((marker_id) => context.state.reminder_markers_by_id[marker_id])
        .filter((marker) =>
          Boolean(
            marker &&
              marker.status === 'active' &&
              marker.kind === 'monk:safe' &&
              marker.source_player_id === monk_player_id
          )
        )
        .map((marker) => ({
          event_type: 'ReminderMarkerCleared',
          payload: {
            marker_id: marker!.marker_id,
            reason: 'monk_retarget'
          }
        }));

      emitted_events.push({
        event_type: 'ReminderMarkerApplied',
        payload: {
          marker_id: `plugin:monk:safe:${context.state.night_number}:${monk_player_id}:${context.selected_option_id}`,
          kind: 'monk:safe',
          effect: 'demon_safe',
          note: 'safe from demon tonight',
          source_player_id: monk_player_id,
          source_character_id: 'monk',
          target_player_id: context.selected_option_id,
          target_scope: 'player',
          authoritative: true,
          expires_policy: 'end_of_night',
          expires_at_day_number: null,
          expires_at_night_number: null,
          source_event_id: null,
          metadata: {
            from_prompt_id: context.prompt_id
          }
        }
      });

      return {
        emitted_events,
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

export function is_monk_prompt_id(prompt_id: string): boolean {
  return prompt_id.startsWith(MONK_PROMPT_PREFIX);
}

function parse_monk_prompt_owner_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  if (parts.length < 5) {
    return null;
  }
  if (parts[0] !== 'plugin' || parts[1] !== 'monk' || parts[2] !== 'night_protect') {
    return null;
  }
  return parts[4] ?? null;
}
