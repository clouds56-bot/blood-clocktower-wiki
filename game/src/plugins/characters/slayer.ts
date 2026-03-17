import type { CharacterPlugin, PluginResult } from '../contracts.js';
import {
  build_registration_query_id,
  plan_registration_query_prompt,
  resolves_as_demon
} from './tb-info-utils.js';

const SLAYER_CLAIMED_PROMPT_PREFIX = 'plugin:slayer:claimed_ability';

export const slayer_plugin: CharacterPlugin = {
  metadata: {
    id: 'slayer',
    name: 'Slayer',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'day',
    is_once_per_game: true,
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
    on_prompt_resolved: (context): PluginResult => {
      const prompt_owner_player_id = parse_claimed_slayer_prompt_owner_player_id(context.prompt_key);
      if (!prompt_owner_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const claimant = context.state.players_by_id[prompt_owner_player_id];
      const target_player_id = context.selected_option_id;
      const target = target_player_id ? context.state.players_by_id[target_player_id] : null;
      if (!claimant || !target_player_id || !target) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const claimant_is_true_slayer = claimant.true_character_id === 'slayer';
      if (!claimant_is_true_slayer) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const slayer_already_spent = context.state.active_reminder_marker_ids.some((marker_id) => {
        const marker = context.state.reminder_markers_by_id[marker_id];
        return Boolean(
          marker &&
            marker.status === 'active' &&
            marker.kind === 'slayer:spent' &&
            marker.source_player_id === claimant.player_id
        );
      });
      if (slayer_already_spent) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const emitted_events: PluginResult['emitted_events'] = [
        {
          event_type: 'ReminderMarkerApplied',
          payload: {
            marker_id: `plugin:slayer:spent:${context.state.day_number}:${claimant.player_id}`,
            kind: 'slayer:spent',
            effect: 'slayer_spent',
            note: 'Slayer shot spent',
            source_player_id: claimant.player_id,
            source_character_id: 'slayer',
            target_player_id: claimant.player_id,
            target_scope: 'player',
            authoritative: true,
            expires_policy: 'manual',
            expires_at_day_number: null,
            expires_at_night_number: null,
            source_event_id: null,
            metadata: {
              target_player_id
            }
          }
        }
      ];

      const registration_request = {
        query_id: build_registration_query_id({
          consumer_role_id: 'slayer',
          query_kind: 'demon_check',
          day_number: context.state.day_number,
          night_number: context.state.night_number,
          subject_player_id: target_player_id,
          query_slot: `claimed_shot:${prompt_owner_player_id}`,
          context_player_ids: [prompt_owner_player_id]
        }),
        consumer_role_id: 'slayer',
        query_kind: 'demon_check' as const,
        subject_player_id: target_player_id,
        subject_context_player_ids: [prompt_owner_player_id]
      };

      const registration_plan = plan_registration_query_prompt({
        state: context.state,
        role_id: 'slayer',
        owner_player_id: prompt_owner_player_id,
        context_tag: target_player_id,
        requests: [registration_request]
      });
      if (
        registration_plan.has_blocking_pending_queries ||
        registration_plan.queued_prompts.length > 0
      ) {
        return {
          emitted_events: [...emitted_events, ...registration_plan.emitted_events],
          queued_prompts: registration_plan.queued_prompts,
          queued_interrupts: []
        };
      }

      const can_kill =
        !claimant.poisoned &&
        !claimant.drunk &&
        target.alive &&
        resolves_as_demon(context.state, registration_request);
      if (can_kill) {
        emitted_events.push({
          event_type: 'PlayerDied',
          payload: {
            player_id: target_player_id,
            day_number: context.state.day_number,
            night_number: context.state.night_number,
            reason: 'ability',
            source_player_id: prompt_owner_player_id,
            source_character_id: 'slayer'
          }
        });
      }

      return {
        emitted_events,
        queued_prompts: [],
        queued_interrupts: []
      };
    },
    on_registration_resolved: (context): PluginResult => {
      const target_player_id = context.context_tag;
      const claimant = context.state.players_by_id[context.owner_player_id];
      const target = context.state.players_by_id[target_player_id];
      if (!claimant || !target || !target.alive) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const registration_request = {
        query_id: build_registration_query_id({
          consumer_role_id: 'slayer',
          query_kind: 'demon_check',
          day_number: context.state.day_number,
          night_number: context.state.night_number,
          subject_player_id: target_player_id,
          query_slot: `claimed_shot:${context.owner_player_id}`,
          context_player_ids: [context.owner_player_id]
        }),
        consumer_role_id: 'slayer',
        query_kind: 'demon_check' as const,
        subject_player_id: target_player_id,
        subject_context_player_ids: [context.owner_player_id]
      };

      const registration_plan = plan_registration_query_prompt({
        state: context.state,
        role_id: 'slayer',
        owner_player_id: context.owner_player_id,
        context_tag: target_player_id,
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

      const can_kill =
        !claimant.poisoned &&
        !claimant.drunk &&
        target.alive &&
        resolves_as_demon(context.state, registration_request);

      if (!can_kill) {
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
              player_id: target_player_id,
              day_number: context.state.day_number,
              night_number: context.state.night_number,
              reason: 'ability',
              source_player_id: context.owner_player_id,
              source_character_id: 'slayer'
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

function parse_claimed_slayer_prompt_owner_player_id(prompt_key: string): string | null {
  const parts = prompt_key.split(':');
  if (
    parts.length >= 5 &&
    parts[0] === 'plugin' &&
    parts[1] === 'slayer' &&
    parts[2] === 'claimed_ability' &&
    /^d\d+$/.test(parts[3] ?? '')
  ) {
    return parts[4] ?? null;
  }
  return null;
}
