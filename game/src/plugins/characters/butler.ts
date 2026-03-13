import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { is_functional_player } from './tb-info-utils.js';

const BUTLER_PROMPT_PREFIX = 'plugin:butler:night_master';

export const butler_plugin: CharacterPlugin = {
  metadata: {
    id: 'butler',
    name: 'Butler',
    type: 'outsider',
    alignment_at_start: 'good',
    timing_category: 'each_night',
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
            prompt_id: `${BUTLER_PROMPT_PREFIX}:${context.state.night_number}:${context.player_id}`,
            kind: 'choice',
            reason: 'plugin:butler:choose master',
            visibility: 'player',
            options
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      const butler_player_id = parse_butler_prompt_owner_player_id(context.prompt_id);
      if (!butler_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }
      if (!is_functional_player(context.state, butler_player_id)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }
      if (context.selected_option_id === null || context.selected_option_id === butler_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const selected_player = context.state.players_by_id[context.selected_option_id];
      if (!selected_player || !selected_player.alive) {
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
              marker.kind === 'butler:master' &&
              marker.source_player_id === butler_player_id
          )
        )
        .map((marker) => ({
          event_type: 'ReminderMarkerCleared',
          payload: {
            marker_id: marker!.marker_id,
            reason: 'butler_retarget'
          }
        }));

      emitted_events.push({
        event_type: 'ReminderMarkerApplied',
        payload: {
          marker_id: `plugin:butler:master:${context.state.night_number}:${butler_player_id}:${context.selected_option_id}`,
          kind: 'butler:master',
          effect: 'butler_master',
          note: 'butler can vote only if this player votes',
          source_player_id: butler_player_id,
          source_character_id: 'butler',
          target_player_id: context.selected_option_id,
          target_scope: 'player',
          authoritative: true,
          expires_policy: 'end_of_day',
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

export function is_butler_prompt_id(prompt_id: string): boolean {
  return prompt_id.startsWith(BUTLER_PROMPT_PREFIX);
}

function parse_butler_prompt_owner_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  if (parts.length < 5) {
    return null;
  }
  if (parts[0] !== 'plugin' || parts[1] !== 'butler' || parts[2] !== 'night_master') {
    return null;
  }
  return parts[4] ?? null;
}
