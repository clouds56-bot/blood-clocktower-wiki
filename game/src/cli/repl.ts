import { readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import type { Command } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import { apply_events } from '../domain/reducer.js';
import { create_initial_state } from '../domain/state.js';
import type { Alignment, GameState } from '../domain/types.js';
import { handle_command } from '../engine/command-handler.js';
import { imp_plugin } from '../plugins/characters/imp.js';
import { poisoner_plugin } from '../plugins/characters/poisoner.js';
import { PluginRegistry } from '../plugins/registry.js';
import { project_for_player } from '../projections/player.js';
import { project_for_public } from '../projections/public.js';
import { project_for_storyteller } from '../projections/storyteller.js';
import { parse_cli_line, type CliLocalAction } from './command-parser.js';
import {
  format_event,
  format_help,
  format_player,
  format_player_projection,
  format_projection_json,
  format_prompt,
  format_prompt_list,
  format_players_table,
  format_public_projection,
  format_state_brief,
  format_state_json,
  format_storyteller_projection
} from './formatters.js';

interface CliContext {
  state: GameState;
  event_log: DomainEvent[];
  next_command_index: number;
  plugin_registry: PluginRegistry;
}

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m'
} as const;

function color_enabled(): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  return Boolean(process.stdout.isTTY);
}

function paint(text: string, color: keyof typeof ANSI): string {
  if (!color_enabled() || color === 'reset') {
    return text;
  }
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

function now_iso(): string {
  return new Date().toISOString();
}

function make_command_id(context: CliContext): string {
  const id = `cli-${String(context.next_command_index).padStart(6, '0')}`;
  context.next_command_index += 1;
  return id;
}

function normalize_script(script: string): string {
  return script.trim().toLowerCase();
}

function resolve_edition_id(script: string): string {
  if (script === 'tb' || script === 'trouble_brewing') {
    return 'trouble_brewing';
  }
  if (script === 'bmr' || script === 'bad_moon_rising') {
    return 'bad_moon_rising';
  }
  if (script === 'snv' || script === 'sects_and_violets') {
    return 'sects_and_violets';
  }
  return script;
}

type CharacterType = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller';

interface EditionSetupData {
  characters: {
    townsfolk: string[];
    outsider: string[];
    minion: string[];
    demon: string[];
  };
}

interface SetupRulesData {
  setups: Record<
    string,
    {
      townsfolk: number;
      outsiders: number;
      minions: number;
      demon: number;
    }
  >;
}

interface AssignedCharacter {
  player_id: string;
  character_id: string;
  character_type: CharacterType;
  alignment: Alignment;
}

function resolve_script_file_id(script: string): 'tb' | 'bmr' | 'snv' | null {
  if (script === 'tb' || script === 'trouble_brewing') {
    return 'tb';
  }
  if (script === 'bmr' || script === 'bad_moon_rising') {
    return 'bmr';
  }
  if (script === 'snv' || script === 'sects_and_violets') {
    return 'snv';
  }
  return null;
}

function infer_alignment_from_type(character_type: CharacterType): Alignment {
  if (character_type === 'demon' || character_type === 'minion') {
    return 'evil';
  }
  return 'good';
}

function is_character_type_token(value: string): value is CharacterType {
  return (
    value === 'townsfolk' ||
    value === 'outsider' ||
    value === 'minion' ||
    value === 'demon' ||
    value === 'traveller'
  );
}

function shuffle<T>(values: T[]): T[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const left = next[i];
    const right = next[j];
    if (left === undefined || right === undefined) {
      continue;
    }
    next[i] = right;
    next[j] = left;
  }
  return next;
}

function take_random_unique(pool: string[], count: number): string[] {
  if (count === 0) {
    return [];
  }
  if (pool.length < count) {
    throw new Error(`insufficient_characters pool=${pool.length} required=${count}`);
  }
  return shuffle(pool).slice(0, count);
}

function repo_root_dir(): string {
  const current_file = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(current_file), '../../..');
}

function read_json<T>(file_path: string): T {
  const content = readFileSync(file_path, 'utf8');
  return JSON.parse(content) as T;
}

function build_random_assignments(script_id: string, player_ids: string[]): AssignedCharacter[] {
  const script_file_id = resolve_script_file_id(script_id);
  if (!script_file_id) {
    throw new Error(`unsupported_quick_setup_script:${script_id}`);
  }

  const root = repo_root_dir();
  const edition_path = path.resolve(root, `data/editions/${script_file_id}.json`);
  const setup_path = path.resolve(root, 'data/rules/setup.json');

  const edition = read_json<EditionSetupData>(edition_path);
  const setup_rules = read_json<SetupRulesData>(setup_path);

  const setup_key = `${player_ids.length}_players`;
  const setup = setup_rules.setups[setup_key];
  if (!setup) {
    throw new Error(`unsupported_player_count:${player_ids.length}`);
  }

  const picked: Array<{ character_id: string; character_type: CharacterType }> = [];
  for (const character_id of take_random_unique(edition.characters.townsfolk, setup.townsfolk)) {
    picked.push({ character_id, character_type: 'townsfolk' });
  }
  for (const character_id of take_random_unique(edition.characters.outsider, setup.outsiders)) {
    picked.push({ character_id, character_type: 'outsider' });
  }
  for (const character_id of take_random_unique(edition.characters.minion, setup.minions)) {
    picked.push({ character_id, character_type: 'minion' });
  }
  for (const character_id of take_random_unique(edition.characters.demon, setup.demon)) {
    picked.push({ character_id, character_type: 'demon' });
  }

  if (picked.length !== player_ids.length) {
    throw new Error(`setup_mismatch expected=${player_ids.length} got=${picked.length}`);
  }

  const randomized = shuffle(picked);
  return randomized.map((item, index) => {
    const player_id = player_ids[index];
    if (!player_id) {
      throw new Error(`player_id_missing_at_index:${index}`);
    }
    return {
      player_id,
      character_id: item.character_id,
      character_type: item.character_type,
      alignment: infer_alignment_from_type(item.character_type)
    };
  });
}

function build_player_ids(player_num: number): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= player_num; i += 1) {
    ids.push(`p${i}`);
  }
  return ids;
}

function run_quick_setup(context: CliContext, script_input: string, player_num: number, game_id?: string): void {
  const script_id = normalize_script(script_input);
  const edition_id = resolve_edition_id(script_id);
  const player_ids = build_player_ids(player_num);
  const resolved_game_id = game_id ?? `${script_id}_${player_num}`;

  let random_assignments: AssignedCharacter[] = [];
  try {
    random_assignments = build_random_assignments(script_id, player_ids);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${paint('quick_setup_error', 'red')} ${message}\n`);
    return;
  }

  context.state = create_initial_state(resolved_game_id);
  context.event_log = [];

  const seed_commands: Array<Omit<Command, 'command_id'>> = [
    {
      command_type: 'SelectScript',
      payload: {
        script_id
      }
    },
    {
      command_type: 'SelectEdition',
      payload: {
        edition_id
      }
    }
  ];

  for (let i = 0; i < player_ids.length; i += 1) {
    const player_id = player_ids[i] as string;
    seed_commands.push({
      command_type: 'AddPlayer',
      payload: {
        player_id,
        display_name: `Player ${i + 1}`
      }
    });
  }

  seed_commands.push({
    command_type: 'SetSeatOrder',
    payload: {
      seat_order: player_ids
    }
  });

  for (const assignment of random_assignments) {
    seed_commands.push({
      command_type: 'AssignCharacter',
      payload: {
        player_id: assignment.player_id,
        true_character_id: assignment.character_id,
        is_demon: assignment.character_type === 'demon',
        is_traveller: assignment.character_type === 'traveller'
      }
    });
    seed_commands.push({
      command_type: 'AssignPerceivedCharacter',
      payload: {
        player_id: assignment.player_id,
        perceived_character_id: assignment.character_id
      }
    });
    seed_commands.push({
      command_type: 'AssignAlignment',
      payload: {
        player_id: assignment.player_id,
        true_alignment: assignment.alignment
      }
    });
  }

  seed_commands.push({
    command_type: 'AdvancePhase',
    payload: {
      phase: 'first_night',
      subphase: 'night_wake_sequence',
      day_number: 0,
      night_number: 1
    }
  });

  for (const command of seed_commands) {
    const full_command: Command = {
      ...command,
      command_id: make_command_id(context),
      actor_id: 'cli'
    } as Command;
    const result = handle_command(context.state, full_command, now_iso(), {
      plugin_registry: context.plugin_registry
    });
    if (!result.ok) {
      process.stdout.write(
        `${paint('quick_setup_error', 'red')} code=${result.error.code} message=${result.error.message} command=${command.command_type}\n`
      );
      return;
    }
    context.state = apply_events(context.state, result.value);
    context.event_log.push(...result.value);
  }

  process.stdout.write(
    `quick setup complete: script=${script_id} players=${player_num} game=${resolved_game_id}\n`
  );
  process.stdout.write(`${format_state_brief(context.state)}\n`);
}

function run_engine_command(context: CliContext, command: Omit<Command, 'command_id'>): boolean {
  const full_command: Command = {
    ...command,
    command_id: make_command_id(context),
    actor_id: 'cli'
  } as Command;

  const result = handle_command(context.state, full_command, now_iso(), {
    plugin_registry: context.plugin_registry
  });
  if (!result.ok) {
    process.stdout.write(
      `${paint('engine_error', 'red')} code=${result.error.code} message=${result.error.message}\n`
    );
    return false;
  }

  const events = result.value;
  context.state = apply_events(context.state, events);
  context.event_log.push(...events);

  if (events.length === 0) {
    process.stdout.write(`${paint('ok', 'green')} (no events)\n`);
    return true;
  }

  process.stdout.write(`${paint('ok', 'green')} emitted=${events.length}\n`);
  const start_index = context.event_log.length - events.length + 1;
  events.forEach((event, event_index) => {
    process.stdout.write(`${format_event(event, start_index + event_index)}\n`);
  });
  return true;
}

function all_player_ids_for_vote(state: GameState): string[] {
  const ids: string[] = [...state.seat_order];
  for (const player_id of Object.keys(state.players_by_id).sort()) {
    if (!ids.includes(player_id)) {
      ids.push(player_id);
    }
  }
  return ids;
}

function run_bulk_vote(
  context: CliContext,
  nomination_id: string,
  voter_player_ids: string[],
  in_favor: boolean
): void {
  const unique_voters = Array.from(new Set(voter_player_ids));
  if (unique_voters.length === 0) {
    process.stdout.write('vote requires at least one voter\n');
    return;
  }

  for (const voter_player_id of unique_voters) {
    run_engine_command(context, {
      command_type: 'CastVote',
      payload: {
        nomination_id,
        voter_player_id,
        in_favor
      }
    });
  }
}

function run_setup_player(
  context: CliContext,
  action: Extract<CliLocalAction, { type: 'setup_player' }>
): void {
  if (!is_character_type_token(action.character_type)) {
    process.stdout.write(`invalid setup-player type: ${action.character_type}\n`);
    return;
  }

  const inferred_alignment = infer_alignment_from_type(action.character_type);
  const alignment = action.alignment ?? inferred_alignment;
  if (action.character_type !== 'traveller' && alignment !== inferred_alignment) {
    process.stdout.write(
      `setup-player alignment mismatch: type=${action.character_type} expects=${inferred_alignment} got=${alignment}\n`
    );
    return;
  }

  const assign_character_ok = run_engine_command(context, {
    command_type: 'AssignCharacter',
    payload: {
      player_id: action.player_id,
      true_character_id: action.true_character_id,
      is_demon: action.character_type === 'demon',
      is_traveller: action.character_type === 'traveller'
    }
  });
  if (!assign_character_ok) {
    return;
  }

  const assign_perceived_ok = run_engine_command(context, {
    command_type: 'AssignPerceivedCharacter',
    payload: {
      player_id: action.player_id,
      perceived_character_id: action.perceived_character_id
    }
  });
  if (!assign_perceived_ok) {
    return;
  }

  run_engine_command(context, {
    command_type: 'AssignAlignment',
    payload: {
      player_id: action.player_id,
      true_alignment: alignment
    }
  });
}

function run_next_phase(context: CliContext): void {
  const { phase, subphase, day_number, night_number } = context.state;

  function advance_to(next_subphase: GameState['subphase']): void {
    run_engine_command(context, {
      command_type: 'AdvancePhase',
      payload: {
        phase,
        subphase: next_subphase,
        day_number,
        night_number
      }
    });
  }

  function advance_to_phase(
    next_phase: GameState['phase'],
    next_subphase: GameState['subphase'],
    next_day_number: number,
    next_night_number: number
  ): void {
    run_engine_command(context, {
      command_type: 'AdvancePhase',
      payload: {
        phase: next_phase,
        subphase: next_subphase,
        day_number: next_day_number,
        night_number: next_night_number
      }
    });
  }

  function step_subphase(sequence: GameState['subphase'][]): boolean {
    const index = sequence.indexOf(subphase);
    if (index === -1) {
      return false;
    }
    const next_index = index + 1;
    if (next_index >= sequence.length) {
      return false;
    }
    const next_subphase = sequence[next_index];
    if (!next_subphase) {
      return false;
    }
    advance_to(next_subphase);
    return true;
  }

  if (phase === 'ended') {
    process.stdout.write('next-phase not allowed: game already ended\n');
    return;
  }

  if (phase === 'setup') {
    advance_to_phase('first_night', 'dusk', day_number, Math.max(1, night_number));
    return;
  }

  if (phase === 'first_night') {
    const ok = step_subphase([
      'dusk',
      'night_wake_sequence',
      'immediate_interrupt_resolution',
      'dawn'
    ]);
    if (!ok) {
      advance_to_phase('day', 'open_discussion', day_number + 1, night_number);
    }
    return;
  }

  if (phase === 'day') {
    if (subphase === 'open_discussion') {
      run_engine_command(context, {
        command_type: 'OpenNominationWindow',
        payload: {
          day_number
        }
      });
      return;
    }

    if (subphase === 'nomination_window') {
      const candidate = [...context.state.day_state.nominations_today]
        .reverse()
        .find((nomination) => nomination.vote_total === null);

      if (candidate) {
        run_engine_command(context, {
          command_type: 'OpenVote',
          payload: {
            nomination_id: candidate.nomination_id,
            nominee_player_id: candidate.nominee_player_id,
            opened_by_player_id: candidate.nominator_player_id
          }
        });
        return;
      }

      run_engine_command(context, {
        command_type: 'ResolveExecution',
        payload: {
          day_number: context.state.day_number
        }
      });
      return;
    }

    if (subphase === 'vote_in_progress') {
      const active_vote = context.state.day_state.active_vote;
      if (!active_vote) {
        process.stdout.write('next-phase failed: active vote not found\n');
        return;
      }

      const all_voters = all_player_ids_for_vote(context.state);
      const missing_voters = all_voters.filter(
        (player_id) => context.state.day_state.active_vote?.votes_by_player_id[player_id] === undefined
      );

      if (missing_voters.length > 0) {
        run_bulk_vote(context, active_vote.nomination_id, missing_voters, false);
      }

      run_engine_command(context, {
        command_type: 'CloseVote',
        payload: {
          nomination_id: active_vote.nomination_id,
          day_number: context.state.day_number
        }
      });
      return;
    }

    if (subphase === 'execution_resolution') {
      if (
        context.state.day_state.execution_occurred_today &&
        !context.state.day_state.execution_consequences_resolved_today
      ) {
        run_engine_command(context, {
          command_type: 'ResolveExecutionConsequences',
          payload: {
            day_number: context.state.day_number
          }
        });
        return;
      }
    }

    const ok = step_subphase([
      'nomination_window',
      'vote_in_progress',
      'execution_resolution',
      'day_end'
    ]);
    if (!ok) {
      advance_to_phase('night', 'dusk', day_number, night_number + 1);
    }
    return;
  }

  const ok = step_subphase([
    'dusk',
    'night_wake_sequence',
    'immediate_interrupt_resolution',
    'dawn'
  ]);
  if (!ok) {
    advance_to_phase('day', 'open_discussion', day_number + 1, night_number);
  }
}

function handle_local_action(context: CliContext, action: CliLocalAction): boolean {
  if (action.type === 'quit') {
    process.stdout.write('bye\n');
    return false;
  }

  if (action.type === 'help') {
    process.stdout.write(`${format_help(action.topic ?? 'all')}\n`);
    return true;
  }

  if (action.type === 'next_phase') {
    run_next_phase(context);
    return true;
  }

  if (action.type === 'state') {
    if (action.format === 'json') {
      process.stdout.write(`${format_state_json(context.state)}\n`);
    } else {
      process.stdout.write(`${format_state_brief(context.state)}\n`);
    }
    return true;
  }

  if (action.type === 'bulk_vote') {
    run_bulk_vote(context, action.nomination_id, action.voter_player_ids, action.in_favor);
    return true;
  }

  if (action.type === 'events') {
    if (context.event_log.length === 0) {
      process.stdout.write('no events\n');
      return true;
    }
    const count = Math.max(0, action.count);
    const start = Math.max(0, context.event_log.length - count);
    context.event_log.slice(start).forEach((event, index) => {
      process.stdout.write(`${format_event(event, start + index + 1)}\n`);
    });
    return true;
  }

  if (action.type === 'players') {
    process.stdout.write(`${format_players_table(context.state)}\n`);
    return true;
  }

  if (action.type === 'player') {
    const player = context.state.players_by_id[action.player_id];
    if (!player) {
      process.stdout.write(`player not found: ${action.player_id}\n`);
      return true;
    }
    process.stdout.write(`${format_player(player)}\n`);
    return true;
  }

  if (action.type === 'view_storyteller') {
    const projection = project_for_storyteller(context.state);
    if (action.json) {
      process.stdout.write(`${format_projection_json(projection)}\n`);
    } else {
      process.stdout.write(`${format_storyteller_projection(projection)}\n`);
    }
    return true;
  }

  if (action.type === 'view_public') {
    const projection = project_for_public(context.state);
    if (action.json) {
      process.stdout.write(`${format_projection_json(projection)}\n`);
    } else {
      process.stdout.write(`${format_public_projection(projection)}\n`);
    }
    return true;
  }

  if (action.type === 'view_player') {
    const projected = project_for_player(context.state, action.player_id);
    if (!projected.ok) {
      process.stdout.write(`projection_error code=${projected.error.code} message=${projected.error.message}\n`);
      return true;
    }
    if (action.json) {
      process.stdout.write(`${format_projection_json(projected.value)}\n`);
    } else {
      process.stdout.write(`${format_player_projection(projected.value)}\n`);
    }
    return true;
  }

  if (action.type === 'setup_player') {
    run_setup_player(context, action);
    return true;
  }

  if (action.type === 'prompts') {
    process.stdout.write(`${format_prompt_list(context.state)}\n`);
    return true;
  }

  if (action.type === 'prompt') {
    const prompt = context.state.prompts_by_id[action.prompt_id];
    if (!prompt) {
      process.stdout.write(`prompt not found: ${action.prompt_id}\n`);
      return true;
    }
    process.stdout.write(`${format_prompt(prompt)}\n`);
    return true;
  }

  if (action.type === 'new_game') {
    context.state = create_initial_state(action.game_id);
    context.event_log = [];
    process.stdout.write(`created game ${action.game_id}\n`);
    process.stdout.write(`${format_state_brief(context.state)}\n`);
    return true;
  }

  if (action.type === 'quick_setup') {
    run_quick_setup(context, action.script, action.player_num, action.game_id);
    return true;
  }

  return true;
}

export async function start_cli_repl(initial_game_id = 'cli_game'): Promise<void> {
  const context: CliContext = {
    state: create_initial_state(initial_game_id),
    event_log: [],
    next_command_index: 1,
    plugin_registry: new PluginRegistry([imp_plugin, poisoner_plugin])
  };

  process.stdout.write('Clocktower Engine CLI (Phase 5)\n');
  process.stdout.write(`${paint('type "help" for commands', 'yellow')}\n`);
  process.stdout.write(`${format_state_brief(context.state)}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'clocktower> '
  });

  rl.prompt();

  rl.on('line', (line) => {
    const parsed = parse_cli_line(line, context.state);
    if (!parsed.ok) {
      process.stdout.write(`${parsed.message}\n`);
      rl.prompt();
      return;
    }

    if (parsed.kind === 'empty') {
      rl.prompt();
      return;
    }

    if (parsed.kind === 'local') {
      const keep_running = handle_local_action(context, parsed.action);
      if (!keep_running) {
        rl.close();
        return;
      }
      rl.prompt();
      return;
    }

    run_engine_command(context, parsed.command);
    rl.prompt();
  });

  await new Promise<void>((resolve) => {
    rl.on('close', () => {
      resolve();
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const game_id = process.argv[2] ?? 'cli_game';
  start_cli_repl(game_id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`fatal: ${message}\n`);
    process.exitCode = 1;
  });
}
