import type { CharacterPlugin, PluginResult } from '../contracts.js';

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
      can_function_while_dead: false,
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

      if (!should_use_alternate_registration(context.query_id)) {
        return null;
      }

      const index = stable_hash(`${context.query_id}:spy`) % SPY_REGISTER_CHARACTER_IDS.length;
      const resolved_character_id = SPY_REGISTER_CHARACTER_IDS[index] ?? null;
      const resolved_character_type = stable_hash(`${context.query_id}:type`) % 2 === 0
        ? 'townsfolk'
        : 'outsider';

      return {
        resolved_alignment: 'good',
        resolved_character_id,
        resolved_character_type
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

function can_apply_registration_provider(subject: {
  true_character_id: string | null;
  alive: boolean;
  drunk: boolean;
  poisoned: boolean;
}): boolean {
  if (subject.true_character_id !== 'spy') {
    return false;
  }
  if (!subject.alive) {
    return true;
  }
  return !subject.drunk && !subject.poisoned;
}

function should_use_alternate_registration(query_id: string): boolean {
  return stable_hash(query_id) % 2 === 0;
}

function stable_hash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i) ?? 0;
    hash = (hash * 31 + code) >>> 0;
  }
  return hash;
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
