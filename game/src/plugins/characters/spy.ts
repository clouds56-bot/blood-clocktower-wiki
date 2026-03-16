import type { CharacterPlugin, PluginResult } from '../contracts.js';
import { can_apply_registration_provider } from './registration-provider-utils.js';

export const spy_plugin: CharacterPlugin = {
  metadata: {
    id: 'spy',
    name: 'Spy',
    type: 'minion',
    alignment_at_start: 'evil',
    timing_category: 'each_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 0,
      max_targets: 0,
      allow_self: true,
      require_alive: true,
      allow_travellers: true
    },
    flags: {
      can_function_while_dead: true,
      can_trigger_on_death: false,
      may_cause_drunkenness: false,
      may_cause_poisoning: false,
      may_change_alignment: false,
      may_change_character: false,
      may_register_as_other: true
    }
  },
  hooks: {
    on_night_wake: (context): PluginResult => {
      const info_mode = get_player_information_mode(context.state, context.player_id);
      if (info_mode === 'inactive') {
        return {
          emitted_events: [],
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
                prompt_id: null,
                note: `spy_grimoire:${context.player_id}:misinformation_required`
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const visible_players = context.state.seat_order
        .map((player_id) => context.state.players_by_id[player_id])
        .filter((player) => Boolean(player && player.true_character_id))
        .map((player) => `${player!.player_id}:${player!.true_character_id}`)
        .join(',');

      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_id: null,
              note: `spy_grimoire:${context.player_id}:${visible_players}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    },
    on_registration_query: (context) => {
      const subject = context.state.players_by_id[context.subject_player_id];
      if (!subject || subject.true_character_id !== 'spy') {
        return null;
      }

      if (!can_apply_registration_provider(subject)) {
        return null;
      }

      const requested = context.requested_fields[0];
      if (!requested) {
        return null;
      }

      if (requested === 'alignment') {
        return {
          status: 'needs_storyteller',
          prompt_hint: 'Spy may register as good for this query, or not trigger.',
          prompt_options: [
            { option_id: 'default', label: 'Not triggered' },
            {
              option_id: 'alignment:good',
              label: 'Register Good',
              resolved_alignment: 'good'
            }
          ]
        };
      }

      if (requested === 'character_type') {
        return {
          status: 'needs_storyteller',
          prompt_hint: 'Spy may register as Townsfolk or Outsider for this query.',
          prompt_options: [
            { option_id: 'default', label: 'Not triggered' },
            {
              option_id: 'character_type:townsfolk',
              label: 'Register Townsfolk',
              resolved_character_type: 'townsfolk'
            },
            {
              option_id: 'character_type:outsider',
              label: 'Register Outsider',
              resolved_character_type: 'outsider'
            }
          ]
        };
      }

      return {
        status: 'needs_storyteller',
        prompt_hint: 'Spy may register as Townsfolk/Outsider character for this query.',
        prompt_options: [
          { option_id: 'default', label: 'Not triggered' },
          ...SPY_REGISTER_CHARACTER_IDS.map((character_id) => ({
            option_id: `character_id:${character_id}`,
            label: `Register ${character_id}`,
            resolved_character_id: character_id
          }))
        ]
      };
    }
  }
};

type PlayerInformationMode = 'inactive' | 'truthful' | 'misinformation';

function get_player_information_mode(
  state: Parameters<NonNullable<CharacterPlugin['hooks']['on_night_wake']>>[0]['state'],
  player_id: string
): PlayerInformationMode {
  const player = state.players_by_id[player_id];
  if (!player || !player.alive) {
    return 'inactive';
  }
  if (player.drunk || player.poisoned) {
    return 'misinformation';
  }
  return 'truthful';
}

const SPY_REGISTER_CHARACTER_IDS: ReadonlyArray<string> = [
  'chef',
  'empath',
  'fortune_teller',
  'investigator',
  'librarian',
  'mayor',
  'monk',
  'ravenkeeper',
  'slayer',
  'soldier',
  'undertaker',
  'virgin',
  'washerwoman',
  'butler',
  'drunk',
  'recluse',
  'saint'
];
