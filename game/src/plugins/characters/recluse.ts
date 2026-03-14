import type { CharacterPlugin } from '../contracts.js';

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

      // Registration adjudication is Storyteller-chosen per query and should be
      // recorded in registration query state. Providers do not auto-randomize.
      if (context.requested_fields.length === 0) {
        return null;
      }

      return null;
    }
  }
};

function can_apply_registration_provider(subject: {
  true_character_id: string | null;
  alive: boolean;
  drunk: boolean;
  poisoned: boolean;
}): boolean {
  if (subject.true_character_id !== 'recluse') {
    return false;
  }
  if (!subject.alive) {
    return true;
  }
  return !subject.drunk && !subject.poisoned;
}
