import assert from 'node:assert/strict';
import test from 'node:test';

import type { Command } from '../../src/domain/commands.js';
import { apply_events } from '../../src/domain/reducer.js';
import { create_initial_state } from '../../src/domain/state.js';
import type { GameState } from '../../src/domain/types.js';
import { handle_command } from '../../src/engine/command-handler.js';
import { chef_plugin } from '../../src/plugins/characters/chef.js';
import { PluginRegistry } from '../../src/plugins/registry.js';
import { parse_cli_line, type CliLocalAction } from '../../src/cli/command-parser.js';

interface ReplayContext {
  state: GameState;
  command_index: number;
  plugin_registry: PluginRegistry;
}

function make_command_id(context: ReplayContext): string {
  const id = `replay-${String(context.command_index).padStart(6, '0')}`;
  context.command_index += 1;
  return id;
}

function run_engine_command(context: ReplayContext, command: Omit<Command, 'command_id'>, line: string): void {
  const full_command: Command = {
    ...command,
    command_id: make_command_id(context),
    actor_id: 'test'
  } as Command;

  const result = handle_command(context.state, full_command, '2026-03-14T00:00:00.000Z', {
    plugin_registry: context.plugin_registry
  });

  assert.equal(
    result.ok,
    true,
    `engine command failed for line "${line}": ${result.ok ? '' : `${result.error.code} ${result.error.message}`}`
  );

  if (result.ok) {
    context.state = apply_events(context.state, result.value);
  }
}

function run_setup_player(context: ReplayContext, action: Extract<CliLocalAction, { type: 'setup_player' }>, line: string): void {
  run_engine_command(
    context,
    {
      command_type: 'AssignCharacter',
      payload: {
        player_id: action.player_id,
        true_character_id: action.true_character_id,
        true_character_type: action.character_type,
        is_demon: action.character_type === 'demon',
        is_traveller: action.character_type === 'traveller'
      }
    },
    line
  );

  run_engine_command(
    context,
    {
      command_type: 'AssignPerceivedCharacter',
      payload: {
        player_id: action.player_id,
        perceived_character_id: action.perceived_character_id
      }
    },
    line
  );

  const inferred_alignment = action.character_type === 'demon' || action.character_type === 'minion' ? 'evil' : 'good';
  const true_alignment = action.alignment ?? inferred_alignment;

  run_engine_command(
    context,
    {
      command_type: 'AssignAlignment',
      payload: {
        player_id: action.player_id,
        true_alignment
      }
    },
    line
  );
}

function run_bulk_vote(context: ReplayContext, action: Extract<CliLocalAction, { type: 'bulk_vote' }>, line: string): void {
  for (const voter_player_id of action.voter_player_ids) {
    run_engine_command(
      context,
      {
        command_type: 'CastVote',
        payload: {
          nomination_id: action.nomination_id,
          voter_player_id,
          in_favor: action.in_favor
        }
      },
      line
    );
  }
}

function replay_commands(lines: string[]): GameState {
  const context: ReplayContext = {
    state: create_initial_state('replay_game'),
    command_index: 1,
    plugin_registry: new PluginRegistry([chef_plugin])
  };

  for (const line of lines) {
    const parsed = parse_cli_line(line, context.state);
    assert.equal(parsed.ok, true, `parse failed for line "${line}": ${parsed.ok ? '' : parsed.message}`);
    if (!parsed.ok || parsed.kind === 'empty') {
      continue;
    }

    if (parsed.kind === 'engine') {
      run_engine_command(context, parsed.command, line);
      continue;
    }

    switch (parsed.action.type) {
      case 'new_game':
        context.state = create_initial_state(parsed.action.game_id);
        break;
      case 'setup_player':
        run_setup_player(context, parsed.action, line);
        break;
      case 'bulk_vote':
        run_bulk_vote(context, parsed.action, line);
        break;
      default:
        assert.fail(`unsupported local replay action: ${parsed.action.type} (line: "${line}")`);
    }
  }

  return context.state;
}

test('replays CLI command script into expected terminal game state', () => {
  const state = replay_commands([
    'new replay_cli',
    'select-script tb',
    'select-edition trouble_brewing',
    'add-player p1 P1',
    'add-player p2 P2',
    'add-player p3 P3',
    'set-seat-order p1 p2 p3',
    'setup-player p1 imp demon evil',
    'setup-player p2 slayer townsfolk good',
    'setup-player p3 chef townsfolk good',
    'phase first_night night_wake_sequence 0 1',
    'phase day nomination_window 1 1',
    'open-noms',
    'nom p2 p1',
    'open-vote',
    'vote p2 p3',
    'close-vote',
    'resolve-exec',
    'resolve-conseq',
    'check-win'
  ]);

  assert.equal(state.status, 'ended');
  assert.equal(state.winning_team, 'good');
  assert.equal(state.end_reason, 'demon_died');
  assert.equal(state.players_by_id.p1?.alive, false);
  assert.equal(state.players_by_id.p2?.alive, true);
  assert.equal(state.players_by_id.p3?.alive, true);
  assert.equal(state.execution_history.length, 1);
  assert.equal(state.execution_history[0]?.player_id, 'p1');
});
