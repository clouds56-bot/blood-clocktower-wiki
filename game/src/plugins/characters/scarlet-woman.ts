import type { CharacterPlugin, PluginResult } from '../contracts.js';

export const scarlet_woman_plugin: CharacterPlugin = {
  metadata: {
    id: 'scarlet_woman',
    name: 'Scarlet Woman',
    type: 'minion',
    alignment_at_start: 'evil',
    timing_category: 'passive',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 0,
      max_targets: 0,
      allow_self: false,
      require_alive: false,
      allow_travellers: false
    },
    flags: {
      can_function_while_dead: false,
      can_trigger_on_death: false,
      may_cause_drunkenness: false,
      may_cause_poisoning: false,
      may_change_alignment: false,
      may_change_character: true,
      may_register_as_other: false
    }
  },
  hooks: {
    on_player_died: (context): PluginResult => {
      const dead_player = context.state.players_by_id[context.player_id];
      if (!dead_player || dead_player.alive || !dead_player.is_demon) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const alive_demon_exists = Object.values(context.state.players_by_id).some((player) => {
        return Boolean(player && player.alive && player.is_demon);
      });
      if (alive_demon_exists) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const alive_non_travellers_now = Object.values(context.state.players_by_id).filter((player) => {
        return Boolean(player && player.alive && !player.is_traveller);
      }).length;
      const alive_non_travellers_before_death = alive_non_travellers_now + (dead_player.is_traveller ? 0 : 1);
      if (alive_non_travellers_before_death < 5) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const scarlet_woman = context.state.seat_order
        .map((player_id) => context.state.players_by_id[player_id])
        .find((player) => {
          return Boolean(
            player &&
              player.alive &&
              player.true_character_id === 'scarlet_woman' &&
              !player.drunk &&
              !player.poisoned
          );
        });

      if (!scarlet_woman) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      return {
        emitted_events: [
          {
            event_type: 'CharacterAssigned',
            payload: {
              player_id: dead_player.player_id,
              true_character_id: dead_player.true_character_id ?? 'imp',
              true_character_type: dead_player.true_character_type ?? 'demon',
              is_demon: false
            }
          },
          {
            event_type: 'CharacterAssigned',
            payload: {
              player_id: scarlet_woman.player_id,
              true_character_id: 'imp',
              true_character_type: 'demon',
              is_demon: true
            }
          },
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_id: null,
              note: `demon_continuity:scarlet_woman:${scarlet_woman.player_id}:from:${dead_player.player_id}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};
