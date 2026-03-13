import type { CharacterPlugin, PluginResult } from '../contracts.js';
import {
  build_info_role_misinformation_hooks,
  build_misinformation_prompt,
  get_player_information_mode,
  is_misinformation_prompt_id
} from './tb-info-utils.js';

const FORTUNE_TELLER_PROMPT_PREFIX = 'plugin:fortune_teller:night_check';

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
            prompt_id: `${FORTUNE_TELLER_PROMPT_PREFIX}:${context.state.night_number}:${context.player_id}`,
            kind: 'choice',
            reason: 'plugin:fortune_teller:choose two players',
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
      if (is_misinformation_prompt_id(context.prompt_id, 'fortune_teller')) {
        return fortune_teller_misinfo_hooks.on_prompt_resolved(context);
      }

      const owner_player_id = parse_fortune_teller_prompt_owner_player_id(context.prompt_id);
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
        misinfo_prompt.prompt_id = `plugin:fortune_teller:misinfo:${context.state.night_number}:${owner_player_id}:${left_id}:${right_id}`;
        return {
          emitted_events: [],
          queued_prompts: [misinfo_prompt],
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
    }
  }
};

export function is_fortune_teller_prompt_id(prompt_id: string): boolean {
  return prompt_id.startsWith(FORTUNE_TELLER_PROMPT_PREFIX);
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
  const left_player = state.players_by_id[left_player_id];
  const right_player = state.players_by_id[right_player_id];
  const selected_ids = new Set([left_player_id, right_player_id]);

  const has_real_demon =
    Boolean(left_player && left_player.is_demon) || Boolean(right_player && right_player.is_demon);
  if (has_real_demon) {
    return true;
  }

  // TODO(tb-registration): include registered-as-demon checks (e.g. Recluse/Spy) once
  // registration query helpers are implemented in the engine.

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
  if (parts.length < 5) {
    return null;
  }
  if (parts[0] !== 'plugin' || parts[1] !== 'fortune_teller' || parts[2] !== 'night_check') {
    return null;
  }
  return parts[4] ?? null;
}

function parse_fortune_teller_misinfo_prompt(
  prompt_id: string
): { owner_player_id: string; left_player_id: string; right_player_id: string } | null {
  const parts = prompt_id.split(':');
  if (parts.length < 7) {
    return null;
  }
  if (parts[0] !== 'plugin' || parts[1] !== 'fortune_teller' || parts[2] !== 'misinfo') {
    return null;
  }
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
