import type { Command } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState } from '../domain/types.js';
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

export function handle_command(
  state: GameState,
  command: Command,
  created_at: string
): EngineResult<DomainEvent[]> {
  switch (command.command_type) {
    case 'AdvancePhase':
      return handle_advance_phase(state, command, created_at);
    case 'OpenNominationWindow':
      return handle_open_nomination_window(state, command, created_at);
    case 'NominatePlayer':
      return handle_nominate_player(state, command, created_at);
    case 'OpenVote':
      return handle_open_vote(state, command, created_at);
    case 'CastVote':
      return handle_cast_vote(state, command, created_at);
    case 'CloseVote':
      return handle_close_vote(state, command, created_at);
    case 'ResolveExecution':
      return handle_resolve_execution(state, command, created_at);
    case 'EndDay':
      return handle_end_day(state, command, created_at);
    case 'CreateGame':
      return {
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
    case 'SelectScript':
      return {
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
    case 'SelectEdition':
      return {
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
    case 'AddPlayer':
      return {
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
    case 'SetSeatOrder':
      return {
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
    case 'AssignCharacter':
      return {
        ok: true,
        value: [
          {
            event_id: `${command.command_id}:CharacterAssigned`,
            event_type: 'CharacterAssigned',
            created_at,
            actor_id: command.actor_id,
            payload: {
              player_id: command.payload.player_id,
              true_character_id: command.payload.true_character_id
            }
          }
        ]
      };
    case 'AssignPerceivedCharacter':
      return {
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
    case 'AssignAlignment':
      return {
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
    default: {
      const neverCommand: never = command;
      return {
        ok: false,
        error: {
          code: 'unknown_command_type',
          message: `unknown command type: ${JSON.stringify(neverCommand)}`
        }
      };
    }
  }
}
