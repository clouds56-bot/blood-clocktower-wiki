import type { CharacterPlugin, PluginResult } from '../contracts.js';
import type { GameState } from '../../domain/types.js';

export const virgin_plugin: CharacterPlugin = {
  metadata: {
    id: 'virgin',
    name: 'Virgin',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'day',
    is_once_per_game: true,
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
    on_nomination_made: (context): PluginResult => {
      return {
        emitted_events: build_virgin_nomination_events(context.state, {
          nomination_id: context.nomination_id,
          day_number: context.day_number,
          nominator_player_id: context.nominator_player_id,
          nominee_player_id: context.nominee_player_id
        }),
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

export function build_virgin_nomination_events(
  state: Readonly<GameState>,
  args: {
    nomination_id: string;
    day_number: number;
    nominator_player_id: string;
    nominee_player_id: string;
  }
): PluginResult['emitted_events'] {
  const nominee = state.players_by_id[args.nominee_player_id];
  const nominator = state.players_by_id[args.nominator_player_id];
  if (!nominee || !nominator) {
    return [];
  }

  if (nominee.true_character_id !== 'virgin' || !nominee.alive) {
    return [];
  }

  const virgin_is_functional = !nominee.drunk && !nominee.poisoned;

  const virgin_spent = state.active_reminder_marker_ids.some((marker_id) => {
    const marker = state.reminder_markers_by_id[marker_id];
    return Boolean(
      marker &&
        marker.status === 'active' &&
        marker.kind === 'virgin:spent' &&
        marker.source_player_id === nominee.player_id
    );
  });
  if (virgin_spent) {
    return [];
  }

  const nominator_is_townsfolk = nominator.true_character_type === 'townsfolk';

  const emitted_events: PluginResult['emitted_events'] = [
    {
      event_type: 'ReminderMarkerApplied',
      payload: {
        marker_id: `plugin:virgin:spent:${args.day_number}:${nominee.player_id}`,
        kind: 'virgin:spent',
        effect: 'ability_spent',
        note: 'Virgin ability spent',
        source_player_id: nominee.player_id,
        source_character_id: 'virgin',
        target_player_id: nominee.player_id,
        target_scope: 'player',
        authoritative: true,
        expires_policy: 'manual',
        expires_at_day_number: null,
        expires_at_night_number: null,
        source_event_id: null,
        metadata: {
          trigger: 'nomination',
          nomination_id: args.nomination_id
        }
      }
    },
    ...(virgin_is_functional && nominator_is_townsfolk
      ? [
          {
            event_type: 'PlayerExecuted' as const,
            payload: {
              day_number: args.day_number,
              player_id: nominator.player_id
            }
          }
        ]
      : [])
  ];

  return emitted_events;
}
