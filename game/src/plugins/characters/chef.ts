import type { CharacterPlugin, PluginResult } from '../contracts.js';
import type { GameState } from '../../domain/types.js';
import {
  build_info_role_misinformation_hooks,
  build_registration_query_id,
  could_resolve_as_evil,
  has_variable_alignment_registration,
  plan_registration_query_prompt,
  resolves_as_evil
} from './tb-info-utils.js';

const chef_info_hooks = build_info_role_misinformation_hooks({
  role_id: 'chef',
  build_truthful_result: (context): PluginResult => {
    const prompt_plan = plan_registration_query_prompt({
      state: context.state,
      role_id: 'chef',
      owner_player_id: context.player_id,
      context_tag: 'adjacent_pairs',
      requests: build_chef_registration_requests(context.state)
    });
    if (prompt_plan.has_blocking_pending_queries || prompt_plan.queued_prompts.length > 0) {
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
            prompt_key: null,
            note: `chef_info:${context.player_id}:adjacent_evil_pairs=${count_adjacent_evil_pairs(context.state)}`
          }
        }
      ],
      queued_prompts: [],
      queued_interrupts: []
    };
  },
  build_misinformation_selection: ({ context }) => ({
    mode: 'number_range',
    range: {
      min: 0,
      max: Object.keys(context.state.players_by_id).length
    }
  }),
  build_misinformation_note: ({ subject_player_id, selected_option_id }) =>
    `chef_info:${subject_player_id}:adjacent_evil_pairs=${selected_option_id ?? '0'}`,
  build_truthful_answer: (context) => String(count_adjacent_evil_pairs(context.state))
});

export const chef_plugin: CharacterPlugin = {
  metadata: {
    id: 'chef',
    name: 'Chef',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'first_night',
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
    on_night_wake: chef_info_hooks.on_night_wake,
    on_prompt_resolved: chef_info_hooks.on_prompt_resolved,
    on_registration_resolved: (context): PluginResult => {
      const prompt_plan = plan_registration_query_prompt({
        state: context.state,
        role_id: 'chef',
        owner_player_id: context.owner_player_id,
        context_tag: context.context_tag,
        requests: build_chef_registration_requests(context.state)
      });

      if (prompt_plan.has_blocking_pending_queries || prompt_plan.queued_prompts.length > 0) {
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
              prompt_key: context.prompt_key,
              note: `chef_info:${context.owner_player_id}:adjacent_evil_pairs=${count_adjacent_evil_pairs(context.state)}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

function build_chef_registration_requests(
  state: Readonly<GameState>
): ChefRegistrationRequest[] {
  const seats = state.seat_order;
  const requests: ChefRegistrationRequest[] = [];

  for (let i = 0; i < seats.length; i += 1) {
    const current_id = seats[i];
    const next_id = seats[(i + 1) % seats.length];
    if (!current_id || !next_id) {
      continue;
    }

    const left_request: ChefRegistrationRequest = {
      query_id: build_registration_query_id({
        consumer_role_id: 'chef',
        query_kind: 'alignment_check',
        day_number: state.day_number,
        night_number: state.night_number,
        subject_player_id: current_id,
        query_slot: `pair_${i}_left`,
        context_player_ids: [next_id]
      }),
      consumer_role_id: 'chef',
      query_kind: 'alignment_check',
      subject_player_id: current_id,
      subject_context_player_ids: [next_id]
    };
    const right_request: ChefRegistrationRequest = {
      query_id: build_registration_query_id({
        consumer_role_id: 'chef',
        query_kind: 'alignment_check',
        day_number: state.day_number,
        night_number: state.night_number,
        subject_player_id: next_id,
        query_slot: `pair_${i}_right`,
        context_player_ids: [current_id]
      }),
      consumer_role_id: 'chef',
      query_kind: 'alignment_check',
      subject_player_id: next_id,
      subject_context_player_ids: [current_id]
    };

    if (should_query_chef_registration(state, left_request, right_request)) {
      requests.push(left_request);
    }
    if (should_query_chef_registration(state, right_request, left_request)) {
      requests.push(right_request);
    }
  }

  return requests;
}

type ChefRegistrationRequest = {
  query_id: string;
  consumer_role_id: string;
  query_kind: 'alignment_check';
  subject_player_id: string;
  subject_context_player_ids: string[];
};

function should_query_chef_registration(
  state: Readonly<GameState>,
  subject_request: ChefRegistrationRequest,
  counterpart_request: ChefRegistrationRequest
): boolean {
  if (!has_variable_alignment_registration(state, subject_request)) {
    return false;
  }

  if (!could_resolve_as_evil(state, counterpart_request)) {
    return false;
  }

  return true;
}

function count_adjacent_evil_pairs(state: Readonly<GameState>): number {
  const seats = state.seat_order;
  if (seats.length < 2) {
    return 0;
  }

  let count = 0;
  for (let i = 0; i < seats.length; i += 1) {
    const current_id = seats[i];
    const next_id = seats[(i + 1) % seats.length];
    if (!current_id || !next_id) {
      continue;
    }

    const current = state.players_by_id[current_id];
    const next = state.players_by_id[next_id];
    if (!current || !next) {
      continue;
    }

    const left_is_evil = resolves_as_evil(state, {
      query_id: build_registration_query_id({
        consumer_role_id: 'chef',
        query_kind: 'alignment_check',
        day_number: state.day_number,
        night_number: state.night_number,
        subject_player_id: current_id,
        query_slot: `pair_${i}_left`,
        context_player_ids: [next_id]
      }),
      consumer_role_id: 'chef',
      query_kind: 'alignment_check',
      subject_player_id: current_id,
      subject_context_player_ids: [next_id]
    });
    const right_is_evil = resolves_as_evil(state, {
      query_id: build_registration_query_id({
        consumer_role_id: 'chef',
        query_kind: 'alignment_check',
        day_number: state.day_number,
        night_number: state.night_number,
        subject_player_id: next_id,
        query_slot: `pair_${i}_right`,
        context_player_ids: [current_id]
      }),
      consumer_role_id: 'chef',
      query_kind: 'alignment_check',
      subject_player_id: next_id,
      subject_context_player_ids: [current_id]
    });

    if (left_is_evil && right_is_evil) {
      count += 1;
    }
  }

  return count;
}
