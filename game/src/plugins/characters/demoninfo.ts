import type { CharacterPlugin, PluginResult } from '../contracts.js';
import type { PromptOption } from '../../domain/types.js';

const GOOD_CHARACTER_IDS_BY_SCRIPT_ID: Readonly<Record<string, readonly string[]>> = {
  tb: [
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
  ],
  trouble_brewing: [
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
  ],
  bmr: [
    'grandmother',
    'sailor',
    'chambermaid',
    'exorcist',
    'innkeeper',
    'gambler',
    'gossip',
    'courtier',
    'professor',
    'minstrel',
    'tea_lady',
    'pacifist',
    'fool',
    'tinker',
    'moonchild',
    'goon',
    'lunatic'
  ],
  bad_moon_rising: [
    'grandmother',
    'sailor',
    'chambermaid',
    'exorcist',
    'innkeeper',
    'gambler',
    'gossip',
    'courtier',
    'professor',
    'minstrel',
    'tea_lady',
    'pacifist',
    'fool',
    'tinker',
    'moonchild',
    'goon',
    'lunatic'
  ],
  snv: [
    'clockmaker',
    'dreamer',
    'snake_charmer',
    'mathematician',
    'flowergirl',
    'town_crier',
    'oracle',
    'savant',
    'seamstress',
    'philosopher',
    'artist',
    'juggler',
    'sage',
    'mutant',
    'sweetheart',
    'barber',
    'klutz'
  ],
  sects_and_violets: [
    'clockmaker',
    'dreamer',
    'snake_charmer',
    'mathematician',
    'flowergirl',
    'town_crier',
    'oracle',
    'savant',
    'seamstress',
    'philosopher',
    'artist',
    'juggler',
    'sage',
    'mutant',
    'sweetheart',
    'barber',
    'klutz'
  ]
};

function build_demoninfo_prompt_key(night_number: number): string {
  return `plugin:demoninfo:first_night_info:n${night_number}`;
}

export const demoninfo_plugin: CharacterPlugin = {
  metadata: {
    id: 'demoninfo',
    name: 'Demon Info',
    type: 'fabled',
    alignment_at_start: 'storyteller_choice',
    timing_category: 'first_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 0,
      max_targets: 0,
      allow_self: false,
      require_alive: false,
      allow_travellers: true
    },
    flags: {
      can_function_while_dead: true,
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
      const non_traveller_count = Object.values(context.state.players_by_id).filter(
        (player) => !player.is_traveller
      ).length;
      if (non_traveller_count < 7) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const minion_ids = context.state.seat_order.filter((player_id) => {
        const player = context.state.players_by_id[player_id];
        return Boolean(player && !player.is_traveller && player.true_character_type === 'minion');
      });

      const options = build_demoninfo_bluff_bundle_options(context.state);

      return {
        emitted_events: [],
        queued_prompts: [
          {
            prompt_key: build_demoninfo_prompt_key(context.state.night_number),
            kind: 'choice',
            reason: `plugin:demoninfo:first_night_info:n${context.state.night_number}`,
            visibility: 'storyteller',
            options,
            selection_mode: 'single_choice',
            number_range: null,
            multi_columns: null,
            storyteller_hint: `demoninfo:minions=${minion_ids.join(',')};choose_bluff_bundle=true`
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      if (context.prompt_key !== build_demoninfo_prompt_key(context.state.night_number)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const selected = context.selected_option_id ?? 'none';
      const minion_ids = context.state.seat_order.filter((player_id) => {
        const player = context.state.players_by_id[player_id];
        return Boolean(player && !player.is_traveller && player.true_character_type === 'minion');
      });
      return {
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_key: context.prompt_key,
              note: `demoninfo:minions=${minion_ids.join(',')};selected=${selected}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

function list_not_in_play_good_character_ids(state: Parameters<NonNullable<CharacterPlugin['hooks']['on_night_wake']>>[0]['state']): string[] {
  const script_id = (state.script_id ?? '').trim().toLowerCase();
  const script_good_ids = GOOD_CHARACTER_IDS_BY_SCRIPT_ID[script_id];
  if (!script_good_ids) {
    return [];
  }

  const in_play = new Set(
    Object.values(state.players_by_id)
      .map((player) => player.true_character_id)
      .filter((character_id): character_id is string => typeof character_id === 'string')
  );

  return script_good_ids.filter((character_id) => !in_play.has(character_id));
}

function build_demoninfo_bluff_bundle_options(
  state: Parameters<NonNullable<CharacterPlugin['hooks']['on_night_wake']>>[0]['state']
): PromptOption[] {
  const candidates = list_not_in_play_good_character_ids(state);
  const options: PromptOption[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      for (let k = j + 1; k < candidates.length; k += 1) {
        const left = candidates[i];
        const middle = candidates[j];
        const right = candidates[k];
        if (!left || !middle || !right) {
          continue;
        }

        const bundle = [left, middle, right];
        options.push({
          option_id: `bluffs:${bundle.join(',')}`,
          label: bundle.join(', ')
        });

        if (options.length >= 24) {
          return options;
        }
      }
    }
  }

  return options;
}
