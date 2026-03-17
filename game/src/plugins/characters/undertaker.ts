import type { CharacterPlugin, PluginResult } from '../contracts.js';
import {
  build_registration_query_id,
  get_player_information_mode,
  plan_registration_query_prompt,
  resolve_registered_character_id
} from './tb-info-utils.js';

export const undertaker_plugin: CharacterPlugin = {
  metadata: {
    id: 'undertaker',
    name: 'Undertaker',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'each_night_except_first',
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
    on_night_wake: (context): PluginResult => {
      const info_mode = get_player_information_mode(context.state, context.player_id);
      if (info_mode === 'inactive') {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_key: null,
                note: `undertaker_info:${context.player_id}:inactive`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (info_mode === 'misinformation') {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_key: null,
                note: `undertaker_info:${context.player_id}:misinformation_required`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const executed_player_id = context.state.day_state.executed_player_id;
      if (!executed_player_id) {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_key: null,
                note: `undertaker_info:${context.player_id}:no_execution_today`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const executed_player = context.state.players_by_id[executed_player_id];
      const executed_character_id = executed_player?.true_character_id;
      if (!executed_character_id) {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_key: null,
                note: `undertaker_info:${context.player_id}:no_execution_today`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const registration_request = build_undertaker_registration_request(
        context.state,
        context.player_id,
        executed_player_id
      );
      const registration_plan = plan_registration_query_prompt({
        state: context.state,
        role_id: 'undertaker',
        owner_player_id: context.player_id,
        context_tag: executed_player_id,
        requests: [registration_request]
      });

      if (
        registration_plan.has_blocking_pending_queries ||
        registration_plan.queued_prompts.length > 0
      ) {
        return {
          emitted_events: registration_plan.emitted_events,
          queued_prompts: registration_plan.queued_prompts,
          queued_interrupts: []
        };
      }

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_key: null,
              note:
                `undertaker_info:${context.player_id}:executed_player=${executed_player_id};` +
                `character=${resolve_registered_character_id(context.state, registration_request) ?? executed_character_id}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    },
    on_registration_resolved: (context): PluginResult => {
      const executed_player_id = context.context_tag;
      const executed_player = context.state.players_by_id[executed_player_id];
      if (!executed_player || !executed_player.true_character_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const registration_request = build_undertaker_registration_request(
        context.state,
        context.owner_player_id,
        executed_player_id
      );
      const registration_plan = plan_registration_query_prompt({
        state: context.state,
        role_id: 'undertaker',
        owner_player_id: context.owner_player_id,
        context_tag: context.context_tag,
        requests: [registration_request]
      });
      if (
        registration_plan.has_blocking_pending_queries ||
        registration_plan.queued_prompts.length > 0
      ) {
        return {
          emitted_events: registration_plan.emitted_events,
          queued_prompts: registration_plan.queued_prompts,
          queued_interrupts: []
        };
      }

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_key: context.prompt_key,
              note:
                `undertaker_info:${context.owner_player_id}:executed_player=${executed_player_id};` +
                `character=${
                  context.decision.resolved_character_id ??
                  resolve_registered_character_id(context.state, registration_request) ??
                  executed_player.true_character_id
                }`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

function build_undertaker_registration_request(
  state: Parameters<typeof get_player_information_mode>[0],
  owner_player_id: string,
  executed_player_id: string
) {
  return {
    query_id: build_registration_query_id({
      consumer_role_id: 'undertaker',
      query_kind: 'character_check',
      day_number: state.day_number,
      night_number: state.night_number,
      subject_player_id: executed_player_id,
      query_slot: `executed_player:${executed_player_id}`,
      context_player_ids: [owner_player_id]
    }),
    consumer_role_id: 'undertaker',
    query_kind: 'character_check' as const,
    subject_player_id: executed_player_id,
    subject_context_player_ids: [owner_player_id]
  };
}
