import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { get_player_information_mode, list_players_by_true_character_type } from './tb-info-utils.js';

export const washerwoman_plugin: CharacterPlugin = {
  metadata: {
    id: 'washerwoman',
    name: 'Washerwoman',
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
    on_night_wake: (context): PluginResult => {
      const info_mode = get_player_information_mode(context.state, context.player_id);
      let note = `washerwoman_info:${context.player_id}:inactive`;
      if (info_mode === 'truthful') {
        note = build_role_pair_note(context.state, context.player_id, 'townsfolk', 'washerwoman_info');
      } else if (info_mode === 'misinformation') {
        note = `washerwoman_info:${context.player_id}:misinformation_required`;
      }

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_id: null,
              note
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

function build_role_pair_note(
  state: Parameters<typeof get_player_information_mode>[0],
  owner_player_id: string,
  target_type: 'townsfolk',
  prefix: string
): string {
  const candidates = list_players_by_true_character_type(state, target_type).filter(
    (player) => player.player_id !== owner_player_id
  );
  if (candidates.length === 0) {
    return `${prefix}:${owner_player_id}:none_in_play`;
  }

  const shown = candidates[0];
  if (!shown || !shown.true_character_id) {
    return `${prefix}:${owner_player_id}:none_in_play`;
  }

  const decoy = state.seat_order
    .map((player_id) => state.players_by_id[player_id])
    .find((player) => player && player.player_id !== shown.player_id && player.player_id !== owner_player_id);

  if (!decoy) {
    return `${prefix}:${owner_player_id}:character=${shown.true_character_id};players=${shown.player_id}`;
  }

  return `${prefix}:${owner_player_id}:character=${shown.true_character_id};players=${shown.player_id},${decoy.player_id}`;
}
