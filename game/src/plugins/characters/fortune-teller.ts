import type { CharacterPlugin, PluginResult } from '../contracts.js';
import {
  build_registration_query_id,
  build_info_role_misinformation_hooks,
  build_misinformation_prompt,
  has_active_fortune_teller_red_herring,
  has_variable_demon_registration,
  get_player_information_mode,
  is_misinformation_prompt_id,
  plan_registration_query_prompt,
  resolves_as_demon
} from './tb-info-utils.js';

const FORTUNE_TELLER_PROMPT_PREFIX = 'plugin:fortune_teller:night_check';

function night_time_key(night_number: number): string {
  return `n${night_number}`;
}

function build_fortune_teller_prompt_key(night_number: number, player_id: string): string {
  return `plugin:fortune_teller:night_check:${night_time_key(night_number)}:${player_id}`;
}

function build_fortune_teller_pair_misinfo_prompt_key(
  night_number: number,
  owner_player_id: string,
  left_player_id: string,
  right_player_id: string
): string {
  return `plugin:fortune_teller:misinfo_pair:${night_time_key(night_number)}:${owner_player_id}:${left_player_id},${right_player_id}`;
}

function resolve_prompt_token(context: Parameters<NonNullable<CharacterPlugin['hooks']['on_prompt_resolved']>>[0]): string {
  return context.prompt_key;
}

function is_fortune_teller_pair_prompt_token(prompt_token: string): boolean {
  return prompt_token.startsWith(FORTUNE_TELLER_PROMPT_PREFIX) ||
    /^plugin:fortune_teller:night_check:n\d+:[a-z0-9_-]+$/.test(prompt_token);
}

const fortune_teller_misinfo_hooks = build_info_role_misinformation_hooks({
  role_id: 'fortune_teller',
  build_truthful_result: (): PluginResult => ({
    emitted_events: [],
    queued_prompts: [],
    queued_interrupts: []
  }),
  build_misinformation_selection: () => ({
    mode: 'single_choice',
    options: [
      { option_id: 'yes', label: 'Show YES' },
      { option_id: 'no', label: 'Show NO' }
    ]
  }),
  build_misinformation_note: ({ subject_player_id, selected_option_id, prompt_id }) => {
    const parsed = parse_fortune_teller_misinfo_prompt(prompt_id);
    if (!parsed) {
      return `fortune_teller_info:${subject_player_id}:pair=unknown,unknown;yes=${selected_option_id === 'yes'}`;
    }
    return `fortune_teller_info:${parsed.owner_player_id}:pair=${parsed.left_player_id},${parsed.right_player_id};yes=${selected_option_id === 'yes'}`;
  }
});

export const fortune_teller_plugin: CharacterPlugin = {
  metadata: {
    id: 'fortune_teller',
    name: 'Fortune Teller',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'each_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 2,
      max_targets: 2,
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
      may_change_character: false,
      may_register_as_other: false
    }
  },
  hooks: {
    on_night_wake: (context): PluginResult => {
      const players = Object.values(context.state.players_by_id).sort((left, right) =>
        left.player_id.localeCompare(right.player_id)
      );
      const player_ids = players.map((player) => player.player_id);

      return {
        emitted_events: [],
        queued_prompts: [
          {
            prompt_id: build_fortune_teller_prompt_key(context.state.night_number, context.player_id),
            prompt_key: build_fortune_teller_prompt_key(context.state.night_number, context.player_id),
            kind: 'choice',
            reason: `plugin:fortune_teller:choose_two_players:${night_time_key(context.state.night_number)}:${context.player_id}`,
            visibility: 'player',
            options: [],
            selection_mode: 'multi_column',
            multi_columns: [player_ids, player_ids],
            storyteller_hint: 'select two different players (order does not matter)'
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      const prompt_token = resolve_prompt_token(context);
      if (is_misinformation_prompt_id(prompt_token, 'fortune_teller')) {
        return fortune_teller_misinfo_hooks.on_prompt_resolved(context);
      }

      if (!is_fortune_teller_pair_prompt_token(prompt_token)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const owner_player_id = parse_fortune_teller_prompt_owner_player_id(prompt_token);
      if (!owner_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const info_mode = get_player_information_mode(context.state, owner_player_id);
      if (info_mode === 'inactive') {
        return {
          emitted_events: [
            {
              event_type: 'StorytellerRulingRecorded',
              payload: {
                prompt_id: context.prompt_id,
                note: `fortune_teller_info:${owner_player_id}:inactive`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const selected_pair = parse_pair_option(context.selected_option_id);
      if (!selected_pair) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const [left_id, right_id] = selected_pair;
      if (!left_id || !right_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (info_mode === 'misinformation') {
        const misinfo_prompt = build_misinformation_prompt(
          'fortune_teller',
          owner_player_id,
          context.state.night_number,
          {
            mode: 'single_choice',
            options: [
              { option_id: 'yes', label: 'Show YES' },
              { option_id: 'no', label: 'Show NO' }
            ]
          }
        );
        misinfo_prompt.prompt_id = build_fortune_teller_pair_misinfo_prompt_key(
          context.state.night_number,
          owner_player_id,
          left_id,
          right_id
        );
        misinfo_prompt.prompt_key = build_fortune_teller_pair_misinfo_prompt_key(
          context.state.night_number,
          owner_player_id,
          left_id,
          right_id
        );
        return {
          emitted_events: [],
          queued_prompts: [misinfo_prompt],
          queued_interrupts: []
        };
      }

      const registration_plan = plan_registration_query_prompt({
        state: context.state,
        role_id: 'fortune_teller',
        owner_player_id,
        context_tag: `${left_id},${right_id}`,
        requests: build_fortune_teller_registration_requests(context.state, left_id, right_id)
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

      const yes = is_demon_check_positive(context.state, left_id, right_id);
      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_id: context.prompt_id,
              note: `fortune_teller_info:${owner_player_id}:pair=${left_id},${right_id};yes=${yes}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    },
    on_registration_resolved: (context): PluginResult => {
      const [left_id, right_id] = parse_pair_context(context.context_tag) ?? [];
      if (!left_id || !right_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const registration_plan = plan_registration_query_prompt({
        state: context.state,
        role_id: 'fortune_teller',
        owner_player_id: context.owner_player_id,
        context_tag: context.context_tag,
        requests: build_fortune_teller_registration_requests(context.state, left_id, right_id)
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

      const yes = is_demon_check_positive(context.state, left_id, right_id);
      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_id: context.prompt_id,
              note: `fortune_teller_info:${context.owner_player_id}:pair=${left_id},${right_id};yes=${yes}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

export function is_fortune_teller_prompt_id(prompt_id: string): boolean {
  return /^plugin:fortune_teller:night_check:n\d+:[a-z0-9_-]+$/.test(prompt_id);
}

function build_fortune_teller_registration_requests(
  state: Parameters<typeof get_player_information_mode>[0],
  left_player_id: string,
  right_player_id: string
): FortuneTellerRegistrationRequest[] {
  const left_request: FortuneTellerRegistrationRequest = {
    query_id: build_registration_query_id({
      consumer_role_id: 'fortune_teller',
      query_kind: 'demon_check',
      day_number: state.day_number,
      night_number: state.night_number,
      subject_player_id: left_player_id,
      query_slot: 'pair_left',
      context_player_ids: [right_player_id]
    }),
    consumer_role_id: 'fortune_teller',
    query_kind: 'demon_check',
    subject_player_id: left_player_id,
    subject_context_player_ids: [right_player_id]
  };
  const right_request: FortuneTellerRegistrationRequest = {
    query_id: build_registration_query_id({
      consumer_role_id: 'fortune_teller',
      query_kind: 'demon_check',
      day_number: state.day_number,
      night_number: state.night_number,
      subject_player_id: right_player_id,
      query_slot: 'pair_right',
      context_player_ids: [left_player_id]
    }),
    consumer_role_id: 'fortune_teller',
    query_kind: 'demon_check',
    subject_player_id: right_player_id,
    subject_context_player_ids: [left_player_id]
  };

  if (is_fortune_teller_yes_guaranteed(state, left_request, right_request)) {
    return [];
  }

  const requests: FortuneTellerRegistrationRequest[] = [];
  if (has_variable_demon_registration(state, left_request)) {
    requests.push(left_request);
  }
  if (has_variable_demon_registration(state, right_request)) {
    requests.push(right_request);
  }

  return requests;
}

type FortuneTellerRegistrationRequest = {
  query_id: string;
  consumer_role_id: string;
  query_kind: 'demon_check';
  subject_player_id: string;
  subject_context_player_ids: string[];
};

function is_fortune_teller_yes_guaranteed(
  state: Parameters<typeof get_player_information_mode>[0],
  left_request: FortuneTellerRegistrationRequest,
  right_request: FortuneTellerRegistrationRequest
): boolean {
  if (resolves_as_demon(state, left_request) || resolves_as_demon(state, right_request)) {
    return true;
  }

  return (
    has_active_fortune_teller_red_herring(state, left_request.subject_player_id) ||
    has_active_fortune_teller_red_herring(state, right_request.subject_player_id)
  );
}

function parse_pair_context(context_tag: string): [string, string] | null {
  const [left, right] = context_tag.split(',').map((token) => token.trim());
  if (!left || !right) {
    return null;
  }
  return [left, right];
}

function parse_pair_option(option_id: string | null): [string, string] | null {
  if (!option_id) {
    return null;
  }
  const delimiter = option_id.includes(',') ? ',' : '|';
  const [left, right] = option_id.split(delimiter).map((token) => token.trim());
  if (!left || !right) {
    return null;
  }
  if (left === right) {
    return null;
  }
  return [left, right];
}

function is_demon_check_positive(
  state: Parameters<typeof get_player_information_mode>[0],
  left_player_id: string,
  right_player_id: string
): boolean {
  const selected_ids = new Set([left_player_id, right_player_id]);

  const has_real_demon =
    resolves_as_demon(state, {
      query_id: build_registration_query_id({
        consumer_role_id: 'fortune_teller',
        query_kind: 'demon_check',
        day_number: state.day_number,
        night_number: state.night_number,
        subject_player_id: left_player_id,
        query_slot: 'pair_left',
        context_player_ids: [right_player_id]
      }),
      consumer_role_id: 'fortune_teller',
      query_kind: 'demon_check',
      subject_player_id: left_player_id,
      subject_context_player_ids: [right_player_id]
    }) ||
    resolves_as_demon(state, {
      query_id: build_registration_query_id({
        consumer_role_id: 'fortune_teller',
        query_kind: 'demon_check',
        day_number: state.day_number,
        night_number: state.night_number,
        subject_player_id: right_player_id,
        query_slot: 'pair_right',
        context_player_ids: [left_player_id]
      }),
      consumer_role_id: 'fortune_teller',
      query_kind: 'demon_check',
      subject_player_id: right_player_id,
      subject_context_player_ids: [left_player_id]
    });
  if (has_real_demon) {
    return true;
  }

  return state.active_reminder_marker_ids.some((marker_id) => {
    const marker = state.reminder_markers_by_id[marker_id];
    if (!marker || marker.status !== 'active') {
      return false;
    }
    if (marker.kind !== 'fortune_teller:red_herring') {
      return false;
    }
    if (!marker.target_player_id) {
      return false;
    }
    return selected_ids.has(marker.target_player_id);
  });
}

function parse_fortune_teller_prompt_owner_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  if (parts.length >= 5 && parts[0] === 'plugin' && parts[1] === 'fortune_teller' && parts[2] === 'night_check' && /^n\d+$/.test(parts[3] ?? '')) {
    return parts[4] ?? null;
  }
  return null;
}

function parse_fortune_teller_misinfo_prompt(
  prompt_id: string
): { owner_player_id: string; left_player_id: string; right_player_id: string } | null {
  const parts = prompt_id.split(':');
  if (parts.length >= 7 && parts[0] === 'plugin' && parts[1] === 'fortune_teller' && parts[2] === 'misinfo') {
    const owner_player_id = parts[4] ?? null;
    const left_player_id = parts[5] ?? null;
    const right_player_id = parts[6] ?? null;
    if (!owner_player_id || !left_player_id || !right_player_id) {
      return null;
    }
    return {
      owner_player_id,
      left_player_id,
      right_player_id
    };
  }

  if (
    parts.length >= 6 &&
    parts[0] === 'plugin' &&
    parts[1] === 'fortune_teller' &&
    parts[2] === 'misinfo_pair' &&
    /^n\d+$/.test(parts[3] ?? '')
  ) {
    const owner_player_id = parts[4] ?? null;
    const pair = parts[5] ?? null;
    const [left_player_id, right_player_id] = (pair ?? '').split(',');
    if (!owner_player_id || !left_player_id || !right_player_id) {
      return null;
    }
    return {
      owner_player_id,
      left_player_id,
      right_player_id
    };
  }

  return null;
}
