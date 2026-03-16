import type { CharacterPlugin, PluginResult } from '../contracts.js';
import type { GameState } from '../../domain/types.js';
import { is_functional_player } from './tb-info-utils.js';

const BUTLER_PROMPT_PREFIX = 'plugin:butler:night_master';

function night_time_key(night_number: number): string {
  return `n${night_number}`;
}

function build_butler_prompt_key(night_number: number, player_id: string): string {
  return `plugin:butler:night_master:${night_time_key(night_number)}:${player_id}`;
}

function resolve_prompt_token(context: Parameters<NonNullable<CharacterPlugin['hooks']['on_prompt_resolved']>>[0]): string {
  return context.prompt_key ?? context.prompt_id;
}

export const butler_plugin: CharacterPlugin = {
  metadata: {
    id: 'butler',
    name: 'Butler',
    type: 'outsider',
    alignment_at_start: 'good',
    timing_category: 'each_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 1,
      max_targets: 1,
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
      const options = Object.values(context.state.players_by_id)
        .filter((player) => player.alive && player.player_id !== context.player_id)
        .map((player) => ({
          option_id: player.player_id,
          label: player.display_name
        }));

      return {
        emitted_events: [],
        queued_prompts: [
          {
            prompt_id: build_butler_prompt_key(context.state.night_number, context.player_id),
            prompt_key: build_butler_prompt_key(context.state.night_number, context.player_id),
            kind: 'choice',
            reason: `plugin:butler:choose_master:${night_time_key(context.state.night_number)}:${context.player_id}`,
            visibility: 'player',
            options
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      const prompt_token = resolve_prompt_token(context);
      const butler_player_id = parse_butler_prompt_owner_player_id(prompt_token);
      if (!butler_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }
      if (!is_functional_player(context.state, butler_player_id)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }
      if (context.selected_option_id === null || context.selected_option_id === butler_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const selected_player = context.state.players_by_id[context.selected_option_id];
      if (!selected_player || !selected_player.alive) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const emitted_events: PluginResult['emitted_events'] = context.state.active_reminder_marker_ids
        .map((marker_id) => context.state.reminder_markers_by_id[marker_id])
        .filter((marker) =>
          Boolean(
            marker &&
              marker.status === 'active' &&
              marker.kind === 'butler:master' &&
              marker.source_player_id === butler_player_id
          )
        )
        .map((marker) => ({
          event_type: 'ReminderMarkerCleared',
          payload: {
            marker_id: marker!.marker_id,
            reason: 'butler_retarget'
          }
        }));

      emitted_events.push({
        event_type: 'ReminderMarkerApplied',
        payload: {
          marker_id: `plugin:butler:master:${context.state.night_number}:${butler_player_id}:${context.selected_option_id}`,
          kind: 'butler:master',
          effect: 'butler_master',
          note: 'butler can vote only if this player votes',
          source_player_id: butler_player_id,
          source_character_id: 'butler',
          target_player_id: context.selected_option_id,
          target_scope: 'player',
          authoritative: true,
          expires_policy: 'end_of_day',
          expires_at_day_number: null,
          expires_at_night_number: null,
            source_event_id: null,
            metadata: {
              from_prompt_id: context.prompt_id,
              from_prompt_key: resolve_prompt_token(context)
            }
          }
        });

      return {
        emitted_events,
        queued_prompts: [],
        queued_interrupts: []
      };
    },
    on_vote_cast_validate: (context) => {
      return validate_butler_vote_cast(context.state, {
        nomination_id: context.nomination_id,
        voter_player_id: context.voter_player_id,
        in_favor: context.in_favor
      });
    }
  }
};

export function validate_butler_vote_cast(
  state: Readonly<GameState>,
  args: {
    nomination_id: string;
    voter_player_id: string;
    in_favor: boolean;
  }
): { ok: true } | { ok: false; error: { code: string; message: string } } {
  if (!args.in_favor) {
    return { ok: true };
  }

  const voter = state.players_by_id[args.voter_player_id];
  if (!voter || !voter.alive || voter.true_character_id !== 'butler' || voter.drunk || voter.poisoned) {
    return { ok: true };
  }

  const active_vote = state.day_state.active_vote;
  if (!active_vote || active_vote.nomination_id !== args.nomination_id) {
    return { ok: true };
  }

  const master_marker = state.active_reminder_marker_ids
    .map((marker_id) => state.reminder_markers_by_id[marker_id])
    .find((marker) => {
      return Boolean(
        marker &&
          marker.status === 'active' &&
          marker.kind === 'butler:master' &&
          marker.authoritative &&
          marker.source_player_id === voter.player_id
      );
    });

  if (!master_marker || !master_marker.target_player_id) {
    return { ok: true };
  }

  const master_voted_in_favor = active_vote.votes_by_player_id[master_marker.target_player_id] === true;
  if (master_voted_in_favor) {
    return { ok: true };
  }

  return {
    ok: false,
    error: {
      code: 'butler_vote_restricted',
      message: 'butler can only vote if their master votes'
    }
  };
}

export function is_butler_prompt_id(prompt_id: string): boolean {
  return /^plugin:butler:night_master:n\d+:[a-z0-9_-]+$/.test(prompt_id);
}

function parse_butler_prompt_owner_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  if (parts.length >= 5 && parts[0] === 'plugin' && parts[1] === 'butler' && parts[2] === 'night_master' && /^n\d+$/.test(parts[3] ?? '')) {
    return parts[4] ?? null;
  }
  return null;
}
