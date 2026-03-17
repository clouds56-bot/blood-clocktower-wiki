import type { CharacterPlugin, PluginResult, PrePlayerDiedHookResult } from '../contracts.js';
import { night_time_key } from './prompt-key-utils.js';

const MAYOR_ALLOW_ORIGINAL_DEATH_OPTION_ID = 'allow_original_death';

function build_mayor_redirect_prompt_key(night_number: number, source_player_id: string): string {
  return `plugin:mayor:redirect_death:${night_time_key(night_number)}:${source_player_id}`;
}

function is_mayor_redirect_prompt_key(prompt_key: string): boolean {
  return /^plugin:mayor:redirect_death:n\d+:[a-z0-9_-]+$/.test(prompt_key);
}

function parse_mayor_redirect_source_player_id(prompt_key: string): string | null {
  const parts = prompt_key.split(':');
  if (parts.length < 5) {
    return null;
  }
  if (parts[0] !== 'plugin' || parts[1] !== 'mayor' || parts[2] !== 'redirect_death') {
    return null;
  }
  if (!/^n\d+$/.test(parts[3] ?? '')) {
    return null;
  }
  return parts[4] ?? null;
}

export const mayor_plugin: CharacterPlugin = {
  metadata: {
    id: 'mayor',
    name: 'Mayor',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'passive',
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
    on_pre_player_died: (context): PrePlayerDiedHookResult => {
      const target = context.state.players_by_id[context.target_player_id];
      if (!target || !target.alive || target.drunk || target.poisoned) {
        return { outcome: 'allow' };
      }

      if (context.reason !== 'night_death' || target.true_character_id !== 'mayor') {
        return { outcome: 'allow' };
      }

      if (context.source_character_id !== 'imp' || !context.source_player_id) {
        return { outcome: 'allow' };
      }

      const existing_redirect_prompt =
        context.state.prompts_by_id[build_mayor_redirect_prompt_key(context.night_number, context.source_player_id)];
      if (existing_redirect_prompt && existing_redirect_prompt.status === 'resolved') {
        return { outcome: 'allow' };
      }

      const redirect_targets = Object.values(context.state.players_by_id)
        .filter((player) => player.alive && player.player_id !== target.player_id)
        .map((player) => ({
          option_id: player.player_id,
          label: player.display_name
        }));

      if (redirect_targets.length === 0) {
        return { outcome: 'prevent' };
      }

      return {
        outcome: 'prompt',
        prompt: {
          prompt_key: build_mayor_redirect_prompt_key(context.night_number, context.source_player_id),
          kind: 'choice',
          reason:
            `plugin:mayor:choose_redirect_target:${night_time_key(context.night_number)}:` +
            `${context.source_player_id}`,
          visibility: 'storyteller',
          options: [
            {
              option_id: MAYOR_ALLOW_ORIGINAL_DEATH_OPTION_ID,
              label: 'Do not redirect'
            },
            ...redirect_targets
          ],
          storyteller_hint:
            `${target.display_name} is a functional Mayor; choose another player who dies instead, ` +
            'or choose Do not redirect.'
        }
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      if (!is_mayor_redirect_prompt_key(context.prompt_key)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const source_player_id = parse_mayor_redirect_source_player_id(context.prompt_key);
      if (!source_player_id || !context.selected_option_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (context.selected_option_id === MAYOR_ALLOW_ORIGINAL_DEATH_OPTION_ID) {
        const mayor_target = Object.values(context.state.players_by_id).find((player) => {
          return player.alive && player.true_character_id === 'mayor';
        });
        if (!mayor_target) {
          return {
            emitted_events: [],
            queued_prompts: [],
            queued_interrupts: []
          };
        }

        return {
          emitted_events: [
            {
              event_type: 'PlayerDied',
              payload: {
                player_id: mayor_target.player_id,
                day_number: context.state.day_number,
                night_number: context.state.night_number,
                reason: 'night_death',
                source_player_id,
                source_character_id: 'imp'
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const redirected_target = context.state.players_by_id[context.selected_option_id];
      if (!redirected_target || !redirected_target.alive) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const mayor = Object.values(context.state.players_by_id).find((player) => {
        return player.alive && player.true_character_id === 'mayor' && !player.drunk && !player.poisoned;
      });
      if (!mayor || redirected_target.player_id === mayor.player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const source_player = context.state.players_by_id[source_player_id];
      if (!source_player || !source_player.alive || source_player.true_character_id !== 'imp') {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (!can_player_die_from_imp_attack(context.state, redirected_target.player_id)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      return {
        emitted_events: [
          {
            event_type: 'PlayerDied',
            payload: {
              player_id: redirected_target.player_id,
              day_number: context.state.day_number,
              night_number: context.state.night_number,
              reason: 'night_death',
              source_player_id,
              source_character_id: 'imp'
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      };
    }
  }
};

function can_player_die_from_imp_attack(
  state: Parameters<NonNullable<CharacterPlugin['hooks']['on_prompt_resolved']>>[0]['state'],
  player_id: string
): boolean {
  const target_player = state.players_by_id[player_id];
  if (!target_player || !target_player.alive) {
    return false;
  }

  const target_is_poisoned_or_drunk = target_player.poisoned || target_player.drunk;
  const target_is_soldier =
    target_player.true_character_id === 'soldier' && !target_is_poisoned_or_drunk;
  const target_protected_by_monk =
    !target_is_poisoned_or_drunk &&
    state.active_reminder_marker_ids.some((marker_id) => {
      const marker = state.reminder_markers_by_id[marker_id];
      return Boolean(
        marker &&
          marker.status === 'active' &&
          marker.kind === 'monk:safe' &&
          marker.authoritative &&
          marker.target_player_id === player_id
      );
    });

  return !target_is_soldier && !target_protected_by_monk;
}
