import type { Command } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState } from '../domain/types.js';
import type { PluginRegistry } from '../plugins/registry.js';
import { handle_advance_phase, type EngineResult } from './phase-machine.js';
import {
  handle_cast_vote,
  handle_close_vote,
  handle_end_day,
  handle_nominate_player,
  handle_open_nomination_window,
  handle_open_vote,
  handle_resolve_execution
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
        is_demon?: boolean;
        is_traveller?: boolean;
      };

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

  return integrate_plugin_runtime(
    state,
    command,
    created_at,
    base_result.value,
    runtime_options.plugin_registry
  );
}
