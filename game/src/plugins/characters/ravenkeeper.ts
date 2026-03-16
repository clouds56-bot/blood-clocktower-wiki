import type { PluginPromptSpec } from '../contracts.js';
import type { CharacterPlugin, PluginResult } from '../contracts.js';
import type { GameState } from '../../domain/types.js';
import { build_night_prompt_key, parse_night_prompt_owner_player_id } from './prompt-key-utils.js';

const RAVENKEEPER_PROMPT_PREFIX = 'plugin:ravenkeeper:night_reveal';

function build_ravenkeeper_prompt_key(night_number: number, player_id: string): string {
  return build_night_prompt_key('ravenkeeper', 'night_reveal', night_number, player_id);
}

export const ravenkeeper_plugin: CharacterPlugin = {
  metadata: {
    id: 'ravenkeeper',
    name: 'Ravenkeeper',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'on_death',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 1,
      max_targets: 1,
      allow_self: true,
      require_alive: false,
      allow_travellers: false
    },
    flags: {
      can_function_while_dead: true,
      can_trigger_on_death: true,
      may_cause_drunkenness: false,
      may_cause_poisoning: false,
      may_change_alignment: false,
      may_change_character: false,
      may_register_as_other: false
    }
  },
  hooks: {
    on_prompt_resolved: (context): PluginResult => {
      const prompt_token = context.prompt_key;
      const ravenkeeper_player_id = parse_ravenkeeper_prompt_owner_player_id(prompt_token);
      if (!ravenkeeper_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const target_player_id = context.selected_option_id;
      const target = target_player_id ? context.state.players_by_id[target_player_id] : null;
      const target_character_id = target?.true_character_id ?? 'unknown';

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_key: context.prompt_key,
              note: `ravenkeeper_info:${ravenkeeper_player_id}:target=${target_player_id ?? 'none'};character=${target_character_id}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

export function build_ravenkeeper_reveal_prompt(
  state: Readonly<GameState>,
  ravenkeeper_player_id: string
): PluginPromptSpec {
  const options = Object.values(state.players_by_id)
    .map((player) => ({
      option_id: player.player_id,
      label: player.display_name
    }))
    .sort((left, right) => left.option_id.localeCompare(right.option_id));

  return {
    prompt_key: build_ravenkeeper_prompt_key(state.night_number, ravenkeeper_player_id),
    kind: 'choice',
    reason: `plugin:ravenkeeper:choose_player:n${state.night_number}:${ravenkeeper_player_id}`,
    visibility: 'player',
    options
  };
}

function parse_ravenkeeper_prompt_owner_player_id(prompt_key: string): string | null {
  return parse_night_prompt_owner_player_id(prompt_key, 'ravenkeeper', 'night_reveal');
}
