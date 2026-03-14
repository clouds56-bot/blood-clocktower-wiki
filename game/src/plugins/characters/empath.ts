import type { CharacterPlugin, PluginResult } from '../contracts.js';
import type { DomainEvent } from '../../domain/events.js';
import { apply_events } from '../../domain/reducer.js';
import {
  build_registration_query_id,
  build_info_role_misinformation_hooks,
  find_alive_neighbors,
  is_registration_query_prompt_id,
  plan_registration_query_prompt,
  resolve_registration_query_prompt,
  resolves_as_evil
} from './tb-info-utils.js';

const empath_info_hooks = build_info_role_misinformation_hooks({
  role_id: 'empath',
  build_truthful_result: (context): PluginResult => {
    const prompt_plan = plan_registration_query_prompt({
      state: context.state,
      role_id: 'empath',
      owner_player_id: context.player_id,
      context_tag: 'alive_neighbors',
      requests: build_empath_registration_requests(context.state, context.player_id)
    });
    if (prompt_plan.queued_prompts.length > 0) {
      return {
        emitted_events: prompt_plan.emitted_events,
        queued_prompts: prompt_plan.queued_prompts,
        queued_interrupts: []
      };
    }

    return {
      emitted_events: [
        {
          event_type: 'StorytellerRulingRecorded',
          payload: {
            prompt_id: null,
            note: `empath_info:${context.player_id}:alive_neighbor_evil_count=${count_evil_neighbors(context.state, context.player_id)}`
          }
        }
      ],
      queued_prompts: [],
      queued_interrupts: []
    };
  },
  build_misinformation_selection: () => ({
    mode: 'number_range',
    range: {
      min: 0,
      max: 2
    }
  }),
  build_misinformation_note: ({ subject_player_id, selected_option_id }) =>
    `empath_info:${subject_player_id}:alive_neighbor_evil_count=${selected_option_id ?? '0'}`,
  build_truthful_answer: (context) => String(count_evil_neighbors(context.state, context.player_id))
});

export const empath_plugin: CharacterPlugin = {
  metadata: {
    id: 'empath',
    name: 'Empath',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'each_night',
    is_once_per_game: false,
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
    on_night_wake: empath_info_hooks.on_night_wake,
    on_prompt_resolved: (context): PluginResult => {
      if (is_registration_query_prompt_id(context.prompt_id, 'empath')) {
        const resolved = resolve_registration_query_prompt({
          state: context.state,
          role_id: 'empath',
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

        const temp_event_id = `empath:registration:resolved:${resolved.event.payload.query_id}`;
        const next_state = apply_events(context.state, [
          {
            event_id: temp_event_id,
            event_type: 'RegistrationDecisionRecorded',
            created_at: '1970-01-01T00:00:00.000Z',
            payload: resolved.event.payload as Extract<
              DomainEvent,
              { event_type: 'RegistrationDecisionRecorded' }
            >['payload']
          }
        ]);

        const prompt_plan = plan_registration_query_prompt({
          state: next_state,
          role_id: 'empath',
          owner_player_id: resolved.parsed.owner_player_id,
          context_tag: resolved.parsed.context_tag,
          requests: build_empath_registration_requests(next_state, resolved.parsed.owner_player_id)
        });

        if (prompt_plan.queued_prompts.length > 0) {
          return {
            emitted_events: [resolved.event, ...prompt_plan.emitted_events],
            queued_prompts: prompt_plan.queued_prompts,
            queued_interrupts: []
          };
        }

        return {
          emitted_events: [
            resolved.event,
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_id: context.prompt_id,
                note: `empath_info:${resolved.parsed.owner_player_id}:alive_neighbor_evil_count=${count_evil_neighbors(next_state, resolved.parsed.owner_player_id)}`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      return empath_info_hooks.on_prompt_resolved(context);
    }
  }
};

function build_empath_registration_requests(
  state: Parameters<typeof find_alive_neighbors>[0],
  player_id: string
): Array<{
  query_id: string;
  consumer_role_id: string;
  query_kind: 'alignment_check';
  subject_player_id: string;
  subject_context_player_ids: string[];
}> {
  return find_alive_neighbors(state, player_id).map((player, index) => {
    return {
      query_id: build_registration_query_id({
        consumer_role_id: 'empath',
        query_kind: 'alignment_check',
        day_number: state.day_number,
        night_number: state.night_number,
        subject_player_id: player.player_id,
        query_slot: `neighbor_${index}`,
        context_player_ids: [player_id]
      }),
      consumer_role_id: 'empath',
      query_kind: 'alignment_check',
      subject_player_id: player.player_id,
      subject_context_player_ids: [player_id]
    };
  });
}

function count_evil_neighbors(
  state: Parameters<typeof find_alive_neighbors>[0],
  player_id: string
): number {
  return find_alive_neighbors(state, player_id).filter((player, index) => {
    return resolves_as_evil(state, {
      query_id: build_registration_query_id({
        consumer_role_id: 'empath',
        query_kind: 'alignment_check',
        day_number: state.day_number,
        night_number: state.night_number,
        subject_player_id: player.player_id,
        query_slot: `neighbor_${index}`,
        context_player_ids: [player_id]
      }),
      consumer_role_id: 'empath',
      query_kind: 'alignment_check',
      subject_player_id: player.player_id,
      subject_context_player_ids: [player_id]
    });
  }).length;
}
