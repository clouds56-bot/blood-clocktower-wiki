import type { CharacterPlugin } from '../contracts.js';
import { can_apply_registration_provider } from './registration-provider-utils.js';

export const recluse_plugin: CharacterPlugin = {
  metadata: {
    id: 'recluse',
    name: 'Recluse',
    type: 'outsider',
    alignment_at_start: 'good',
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
    on_registration_query: (context) => {
      const subject = context.state.players_by_id[context.subject_player_id];
      if (!subject || subject.true_character_id !== 'recluse') {
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
          prompt_hint: 'Recluse may register as evil for this query, or not trigger.',
          prompt_options: [
            { option_id: 'default', label: 'Not triggered' },
            {
              option_id: 'alignment:evil',
              label: 'Register Evil',
              resolved_alignment: 'evil'
            }
          ]
        };
      }

      if (requested === 'character_type') {
        return {
          status: 'needs_storyteller',
          prompt_hint: 'Recluse may register as Minion or Demon for this query.',
          prompt_options: [
            { option_id: 'default', label: 'Not triggered' },
            {
              option_id: 'character_type:minion',
              label: 'Register Minion',
              resolved_character_type: 'minion'
            },
            {
              option_id: 'character_type:demon',
              label: 'Register Demon',
              resolved_character_type: 'demon'
            }
          ]
        };
      }

      return {
        status: 'needs_storyteller',
        prompt_hint: 'Recluse may register as Minion/Demon character for this query.',
        prompt_options: [
          { option_id: 'default', label: 'Not triggered' },
          ...RECLUSE_REGISTER_CHARACTER_IDS.map((character_id) => ({
            option_id: `character_id:${character_id}`,
            label: `Register ${character_id}`,
            resolved_character_id: character_id
          }))
        ]
      };
    }
  }
};

const RECLUSE_REGISTER_CHARACTER_IDS: ReadonlyArray<string> = [
  'baron',
  'poisoner',
  'scarlet_woman',
  'spy',
  'imp'
];
