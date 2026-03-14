import type { Command } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState, PlayerCharacterType } from '../domain/types.js';
import { apply_events } from '../domain/reducer.js';
import { dispatch_vote_cast_validate } from '../plugins/dispatcher.js';
import type { PluginRegistry } from '../plugins/registry.js';
import { handle_advance_phase, type EngineResult } from './phase-machine.js';
import {
  handle_cast_vote,
  handle_close_vote,
  handle_end_day,
  handle_nominate_player,
  handle_open_nomination_window,
  handle_open_vote,
  handle_resolve_execution,
  handle_use_slayer_shot
} from './day-flow.js';
import {
  handle_apply_death,
  handle_mark_player_survived_execution,
  handle_resolve_execution_consequences
} from './death-flow.js';
import { handle_check_win_conditions, handle_declare_forced_victory } from './win-check.js';
import {
  handle_cancel_prompt,
  handle_create_prompt,
  handle_resolve_prompt
} from '../adjudication/prompts.js';
import { integrate_plugin_runtime } from './plugin-runtime.js';
import {
  handle_apply_drunk,
  handle_apply_poison,
  handle_apply_reminder_marker,
  handle_clear_reminder_marker,
  handle_clear_reminder_markers_by_selector,
  handle_sweep_reminder_expiry
} from './reminder-flow.js';

const MUTATING_COMMANDS: Set<Command['command_type']> = new Set([
  'SelectScript',
  'SelectEdition',
  'AddPlayer',
  'SetSeatOrder',
  'AssignCharacter',
  'AssignPerceivedCharacter',
  'AssignAlignment',
  'AdvancePhase',
  'OpenNominationWindow',
  'NominatePlayer',
  'OpenVote',
  'CastVote',
  'CloseVote',
  'ResolveExecution',
  'ResolveExecutionConsequences',
  'ApplyDeath',
  'MarkPlayerSurvivedExecution',
  'UseSlayerShot',
  'ApplyPoison',
  'ApplyDrunk',
  'ApplyReminderMarker',
  'ClearReminderMarker',
  'ClearReminderMarkersBySelector',
  'SweepReminderExpiry',
  'CreatePrompt',
  'ResolvePrompt',
  'CancelPrompt',
  'CheckWinConditions',
  'DeclareForcedVictory',
  'EndDay'
]);

export function handle_command(
  state: GameState,
  command: Command,
  created_at: string,
  runtime_options: {
    plugin_registry?: PluginRegistry;
  } = {}
): EngineResult<DomainEvent[]> {
  if (state.status === 'ended' && MUTATING_COMMANDS.has(command.command_type)) {
    return {
      ok: false,
      error: {
        code: 'game_already_ended',
        message: `cannot run ${command.command_type} after game ended`
      }
    };
  }

  let base_result: EngineResult<DomainEvent[]>;

  switch (command.command_type) {
    case 'AdvancePhase':
      base_result = handle_advance_phase(state, command, created_at);
      break;
    case 'OpenNominationWindow':
      base_result = handle_open_nomination_window(state, command, created_at);
      break;
    case 'NominatePlayer':
      base_result = handle_nominate_player(state, command, created_at);
      break;
    case 'OpenVote':
      base_result = handle_open_vote(state, command, created_at);
      break;
    case 'CastVote':
      if (runtime_options.plugin_registry) {
        const voter = state.players_by_id[command.payload.voter_player_id];
        const voter_plugin_ids = voter?.true_character_id ? [voter.true_character_id] : [];
        if (voter_plugin_ids.length > 0) {
          const vote_validation = dispatch_vote_cast_validate(
            runtime_options.plugin_registry,
            voter_plugin_ids,
            {
              state,
              nomination_id: command.payload.nomination_id,
              voter_player_id: command.payload.voter_player_id,
              in_favor: command.payload.in_favor
            }
          );
          if (!vote_validation.ok) {
            return {
              ok: false,
              error: {
                code: vote_validation.error.code,
                message: vote_validation.error.message
              }
            };
          }
        }
      }
      base_result = handle_cast_vote(state, command, created_at);
      break;
    case 'CloseVote':
      base_result = handle_close_vote(state, command, created_at);
      break;
    case 'ResolveExecution':
      base_result = handle_resolve_execution(state, command, created_at);
      break;
    case 'ResolveExecutionConsequences':
      base_result = handle_resolve_execution_consequences(state, command, created_at);
      break;
    case 'ApplyDeath':
      base_result = handle_apply_death(state, command, created_at);
      break;
    case 'MarkPlayerSurvivedExecution':
      base_result = handle_mark_player_survived_execution(state, command, created_at);
      break;
    case 'UseSlayerShot':
      base_result = handle_use_slayer_shot(state, command, created_at);
      break;
    case 'ApplyPoison':
      base_result = handle_apply_poison(state, command, created_at);
      break;
    case 'ApplyDrunk':
      base_result = handle_apply_drunk(state, command, created_at);
      break;
    case 'ApplyReminderMarker':
      base_result = handle_apply_reminder_marker(state, command, created_at);
      break;
    case 'ClearReminderMarker':
      base_result = handle_clear_reminder_marker(state, command, created_at);
      break;
    case 'ClearReminderMarkersBySelector':
      base_result = handle_clear_reminder_markers_by_selector(state, command, created_at);
      break;
    case 'SweepReminderExpiry':
      base_result = handle_sweep_reminder_expiry(state, command, created_at);
      break;
    case 'CreatePrompt':
      base_result = handle_create_prompt(state, command, created_at);
      break;
    case 'ResolvePrompt':
      base_result = handle_resolve_prompt(state, command, created_at);
      break;
    case 'CancelPrompt':
      base_result = handle_cancel_prompt(state, command, created_at);
      break;
    case 'CheckWinConditions':
      base_result = handle_check_win_conditions(state, command, created_at);
      break;
    case 'DeclareForcedVictory':
      base_result = handle_declare_forced_victory(state, command, created_at);
      break;
    case 'EndDay':
      base_result = handle_end_day(state, command, created_at);
      break;
    case 'CreateGame':
      base_result = {
        ok: true,
        value: [
          {
            event_id: `${command.command_id}:GameCreated`,
            event_type: 'GameCreated',
            created_at,
            actor_id: command.actor_id,
            payload: {
              game_id: command.payload.game_id,
              created_at: command.payload.created_at
            }
          }
        ]
      };
      break;
    case 'SelectScript':
      base_result = {
        ok: true,
        value: [
          {
            event_id: `${command.command_id}:ScriptSelected`,
            event_type: 'ScriptSelected',
            created_at,
            actor_id: command.actor_id,
            payload: {
              script_id: command.payload.script_id
            }
          }
        ]
      };
      break;
    case 'SelectEdition':
      base_result = {
        ok: true,
        value: [
          {
            event_id: `${command.command_id}:EditionSelected`,
            event_type: 'EditionSelected',
            created_at,
            actor_id: command.actor_id,
            payload: {
              edition_id: command.payload.edition_id
            }
          }
        ]
      };
      break;
    case 'AddPlayer':
      base_result = {
        ok: true,
        value: [
          {
            event_id: `${command.command_id}:PlayerAdded`,
            event_type: 'PlayerAdded',
            created_at,
            actor_id: command.actor_id,
            payload: {
              player_id: command.payload.player_id,
              display_name: command.payload.display_name
            }
          }
        ]
      };
      break;
    case 'SetSeatOrder':
      base_result = {
        ok: true,
        value: [
          {
            event_id: `${command.command_id}:SeatOrderSet`,
            event_type: 'SeatOrderSet',
            created_at,
            actor_id: command.actor_id,
            payload: {
              seat_order: [...command.payload.seat_order]
            }
          }
        ]
      };
      break;
    case 'AssignCharacter':
      {
      const payload = {
        player_id: command.payload.player_id,
        true_character_id: command.payload.true_character_id
      } as {
        player_id: string;
        true_character_id: string;
        true_character_type?: PlayerCharacterType;
        is_demon?: boolean;
        is_traveller?: boolean;
      };

      if (command.payload.true_character_type !== undefined) {
        payload.true_character_type = command.payload.true_character_type;
      }
      if (command.payload.is_demon !== undefined) {
        payload.is_demon = command.payload.is_demon;
      }
      if (command.payload.is_traveller !== undefined) {
        payload.is_traveller = command.payload.is_traveller;
      }

      base_result = {
        ok: true,
        value: [
          {
            event_id: `${command.command_id}:CharacterAssigned`,
            event_type: 'CharacterAssigned',
            created_at,
            actor_id: command.actor_id,
            payload
          }
        ]
      };
      break;
    }
    case 'AssignPerceivedCharacter':
      base_result = {
        ok: true,
        value: [
          {
            event_id: `${command.command_id}:PerceivedCharacterAssigned`,
            event_type: 'PerceivedCharacterAssigned',
            created_at,
            actor_id: command.actor_id,
            payload: {
              player_id: command.payload.player_id,
              perceived_character_id: command.payload.perceived_character_id
            }
          }
        ]
      };
      break;
    case 'AssignAlignment':
      base_result = {
        ok: true,
        value: [
          {
            event_id: `${command.command_id}:AlignmentAssigned`,
            event_type: 'AlignmentAssigned',
            created_at,
            actor_id: command.actor_id,
            payload: {
              player_id: command.payload.player_id,
              true_alignment: command.payload.true_alignment
            }
          }
        ]
      };
      break;
    default: {
      const neverCommand: never = command;
      base_result = {
        ok: false,
        error: {
          code: 'unknown_command_type',
          message: `unknown command type: ${JSON.stringify(neverCommand)}`
        }
      };
      break;
    }
  }

  if (!base_result.ok) {
    return base_result;
  }

  if (command.command_type === 'AdvancePhase') {
    const state_after_phase = apply_events(state, base_result.value);
    const sweep_command = {
      command_type: 'SweepReminderExpiry' as const,
      command_id: `${command.command_id}:AutoSweepReminderExpiry`,
      ...(command.actor_id === undefined ? {} : { actor_id: command.actor_id }),
      payload: {
        phase: command.payload.phase,
        subphase: command.payload.subphase,
        day_number: command.payload.day_number,
        night_number: command.payload.night_number
      }
    };
    const sweep_result = handle_sweep_reminder_expiry(
      state_after_phase,
      sweep_command,
      created_at
    );
    if (!sweep_result.ok) {
      return sweep_result;
    }
    if (sweep_result.value.length > 0) {
      base_result = {
        ok: true,
        value: [...base_result.value, ...sweep_result.value]
      };
    }
  }

  return integrate_plugin_runtime(
    state,
    command,
    created_at,
    base_result.value,
    runtime_options.plugin_registry
  );
}
