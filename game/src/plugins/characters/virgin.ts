import type { CharacterPlugin, PluginResult } from '../contracts.js';
import type { DomainEvent } from '../../domain/events.js';
import { apply_events } from '../../domain/reducer.js';
import type { GameState } from '../../domain/types.js';
import {
  build_registration_query_id,
  is_registration_query_prompt_id,
  plan_registration_query_prompt,
  resolve_registered_character_type,
  resolve_registration_query_prompt
} from './tb-info-utils.js';

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
      return build_virgin_nomination_result(context.state, {
        nomination_id: context.nomination_id,
        day_number: context.day_number,
        nominator_player_id: context.nominator_player_id,
        nominee_player_id: context.nominee_player_id
      });
    },
    on_prompt_resolved: (context): PluginResult => {
      if (!is_registration_query_prompt_id(context.prompt_id, 'virgin')) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const resolved = resolve_registration_query_prompt({
        state: context.state,
        role_id: 'virgin',
        prompt_id: context.prompt_id,
        selected_option_id: context.selected_option_id
      });
      if (!resolved.ok) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const temp_state = apply_events(context.state, [
        {
          event_id: `virgin:registration:resolved:${resolved.parsed.query_id}`,
          event_type: 'RegistrationDecisionRecorded',
          created_at: '1970-01-01T00:00:00.000Z',
          payload: resolved.event.payload as Extract<
            DomainEvent,
            { event_type: 'RegistrationDecisionRecorded' }
          >['payload']
        }
      ]);

      const query = temp_state.registration_queries_by_id[resolved.parsed.query_id];
      if (!query) {
        return {
          emitted_events: [resolved.event],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const registered_type = resolve_registered_character_type(temp_state, {
        query_id: query.query_id,
        consumer_role_id: query.consumer_role_id,
        query_kind: query.query_kind,
        subject_player_id: query.subject_player_id,
        subject_context_player_ids: query.subject_context_player_ids
      });

      return {
        emitted_events: [
          resolved.event,
          ...(registered_type === 'townsfolk'
            ? [
                {
                  event_type: 'PlayerExecuted' as const,
                  payload: {
                    day_number: query.day_number,
                    player_id: query.subject_player_id
                  }
                },
                {
                  event_type: 'PlayerDied' as const,
                  payload: {
                    player_id: query.subject_player_id,
                    day_number: query.day_number,
                    night_number: query.night_number,
                    reason: 'execution' as const
                  }
                }
              ]
            : [])
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

function build_virgin_nomination_result(
  state: Readonly<GameState>,
  args: {
    nomination_id: string;
    day_number: number;
    nominator_player_id: string;
    nominee_player_id: string;
  }
): PluginResult {
  const nominee = state.players_by_id[args.nominee_player_id];
  const nominator = state.players_by_id[args.nominator_player_id];
  if (!nominee || !nominator) {
    return {
      emitted_events: [],
      queued_prompts: [],
      queued_interrupts: []
    };
  }

  if (nominee.true_character_id !== 'virgin' || !nominee.alive) {
    return {
      emitted_events: [],
      queued_prompts: [],
      queued_interrupts: []
    };
  }

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
    return {
      emitted_events: [],
      queued_prompts: [],
      queued_interrupts: []
    };
  }

  const virgin_is_functional = !nominee.drunk && !nominee.poisoned;

  const spent_event: PluginResult['emitted_events'][number] = {
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
  };

  if (!virgin_is_functional) {
    return {
      emitted_events: [spent_event],
      queued_prompts: [],
      queued_interrupts: []
    };
  }

  if (nominator.true_character_type === 'townsfolk') {
    return {
      emitted_events: [
        spent_event,
        {
          event_type: 'PlayerExecuted',
          payload: {
            day_number: args.day_number,
            player_id: nominator.player_id
          }
        }
      ],
      queued_prompts: [],
      queued_interrupts: []
    };
  }

  const registration_request = {
    query_id: build_registration_query_id({
      consumer_role_id: 'virgin',
      query_kind: 'character_type_check',
      day_number: args.day_number,
      night_number: state.night_number,
      subject_player_id: nominator.player_id,
      query_slot: `nomination_${args.nomination_id}`,
      context_player_ids: [nominee.player_id]
    }),
    consumer_role_id: 'virgin',
    query_kind: 'character_type_check' as const,
    subject_player_id: nominator.player_id,
    subject_context_player_ids: [nominee.player_id]
  };

  const prompt_plan = plan_registration_query_prompt({
    state,
    role_id: 'virgin',
    owner_player_id: nominee.player_id,
    context_tag: build_virgin_registration_context_tag(args),
    requests: [registration_request]
  });

  if (prompt_plan.queued_prompts.length > 0) {
    return {
      emitted_events: [spent_event, ...prompt_plan.emitted_events],
      queued_prompts: prompt_plan.queued_prompts,
      queued_interrupts: []
    };
  }

  const registered_type = resolve_registered_character_type(state, registration_request);
  return {
    emitted_events: [
      spent_event,
      ...(registered_type === 'townsfolk'
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
    ],
    queued_prompts: [],
    queued_interrupts: []
  };
}

function build_virgin_registration_context_tag(args: {
  nomination_id: string;
  nominator_player_id: string;
  nominee_player_id: string;
}): string {
  return `${args.nomination_id},${args.nominator_player_id},${args.nominee_player_id}`;
}
