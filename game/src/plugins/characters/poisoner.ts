import type { CharacterPlugin, PluginResult } from '../contracts.js';

const POISONER_PROMPT_PREFIX = 'plugin:poisoner';

function night_time_key(night_number: number): string {
  return `n${night_number}`;
}

function build_poisoner_prompt_key(night_number: number, player_id: string): string {
  return `plugin:poisoner:${night_time_key(night_number)}:${player_id}:night_poison`;
}

function build_poisoner_prompt_id(night_number: number, player_id: string): string {
  return `plugin:poisoner:night_poison:${night_number}:${player_id}`;
}

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
            prompt_id: build_poisoner_prompt_id(context.state.night_number, context.player_id),
            prompt_key: build_poisoner_prompt_key(context.state.night_number, context.player_id),
            kind: 'choice',
            reason: `plugin:poisoner:${night_time_key(context.state.night_number)}:${context.player_id}:choose_poison_target`,
            visibility: 'player',
            options
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      const poisoner_player_id = parse_poisoner_prompt_owner_player_id(context.prompt_id);
      if (!poisoner_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const poisoner_player = context.state.players_by_id[poisoner_player_id];
      const poisoner_can_use_ability = Boolean(
        poisoner_player && poisoner_player.alive && !poisoner_player.drunk && !poisoner_player.poisoned
      );
      if (!poisoner_can_use_ability) {
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

      const emitted_events: PluginResult['emitted_events'] = context.state.active_reminder_marker_ids
        .map((marker_id) => context.state.reminder_markers_by_id[marker_id])
        .filter((marker) =>
          Boolean(
            marker &&
              marker.status === 'active' &&
              marker.kind === 'poisoner:poisoned' &&
              marker.source_player_id === poisoner_player_id
          )
        )
        .map((marker) => ({
          event_type: 'ReminderMarkerCleared',
          payload: {
            marker_id: marker!.marker_id,
            reason: 'poisoner_retarget'
          }
        }));

      const selected_player = context.state.players_by_id[context.selected_option_id];
      if (selected_player) {
        emitted_events.push({
          event_type: 'ReminderMarkerApplied',
          payload: {
            marker_id: `plugin:poisoner:poisoned:${context.state.night_number}:${poisoner_player_id}:${context.selected_option_id}`,
            kind: 'poisoner:poisoned',
            effect: 'poisoned',
            note: 'poisoned by poisoner',
            source_player_id: poisoner_player_id,
            source_character_id: 'poisoner',
            target_player_id: context.selected_option_id,
            target_scope: 'player',
            authoritative: true,
            expires_policy: 'at_night',
            expires_at_day_number: null,
            expires_at_night_number: context.state.night_number + 1,
            source_event_id: null,
            metadata: {
              from_prompt_id: context.prompt_id
            }
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
  return prompt_id.startsWith(`${POISONER_PROMPT_PREFIX}:night_poison:`) ||
    prompt_id.startsWith(`${POISONER_PROMPT_PREFIX}:n`);
}

function parse_poisoner_prompt_owner_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  if (parts.length >= 5 && parts[0] === 'plugin' && parts[1] === 'poisoner' && parts[2] === 'night_poison') {
    return parts[4] ?? null;
  }
  if (parts.length >= 6 && parts[0] === 'plugin' && parts[1] === 'poisoner' && /^n\d+$/.test(parts[2] ?? '') && parts[4] === 'night_poison') {
    return parts[3] ?? null;
  }
  if (parts.length < 5) {
    return null;
  }
  return null;
}
