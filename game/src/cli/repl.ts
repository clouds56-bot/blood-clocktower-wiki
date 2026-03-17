import { readFile } from 'node:fs/promises';
import readline from 'node:readline';

import type { Command } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import { apply_events } from '../domain/reducer.js';
import { create_initial_state } from '../domain/state.js';
import type { GameState } from '../domain/types.js';
import { handle_command } from '../engine/command-handler.js';
import { chef_plugin } from '../plugins/characters/chef.js';
import { butler_plugin } from '../plugins/characters/butler.js';
import { empath_plugin } from '../plugins/characters/empath.js';
import { fortune_teller_plugin } from '../plugins/characters/fortune-teller.js';
import { imp_plugin } from '../plugins/characters/imp.js';
import { investigator_plugin } from '../plugins/characters/investigator.js';
import { librarian_plugin } from '../plugins/characters/librarian.js';
import { mayor_plugin } from '../plugins/characters/mayor.js';
import { monk_plugin } from '../plugins/characters/monk.js';
import { poisoner_plugin } from '../plugins/characters/poisoner.js';
import { ravenkeeper_plugin } from '../plugins/characters/ravenkeeper.js';
import { recluse_plugin } from '../plugins/characters/recluse.js';
import { scarlet_woman_plugin } from '../plugins/characters/scarlet-woman.js';
import { saint_plugin } from '../plugins/characters/saint.js';
import { slayer_plugin } from '../plugins/characters/slayer.js';
import { soldier_plugin } from '../plugins/characters/soldier.js';
import { spy_plugin } from '../plugins/characters/spy.js';
import { undertaker_plugin } from '../plugins/characters/undertaker.js';
import { virgin_plugin } from '../plugins/characters/virgin.js';
import { washerwoman_plugin } from '../plugins/characters/washerwoman.js';
import { PluginRegistry } from '../plugins/registry.js';
import { project_for_player } from '../projections/player.js';
import { project_for_public } from '../projections/public.js';
import { project_for_storyteller } from '../projections/storyteller.js';
import { create_next_scope_anchor, has_reached_next_scope_target } from './next-utils.js';
import { random_option_id_for_prompt } from './parser-common.js';
import { CliChannelBus, type CliChannel } from './channels.js';
import {
  build_quick_setup_seed_commands,
  infer_alignment_from_type,
  is_character_type_token
} from './quick-setup.js';
import { parse_cli_line, type CliLocalAction } from './command-parser.js';
import {
  format_event,
  format_help,
  format_marker,
  format_marker_list,
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

export interface CliContext {
  state: GameState;
  event_log: DomainEvent[];
  next_command_index: number;
  plugin_registry: PluginRegistry;
  channel_bus?: CliChannelBus;
}

interface ProcessLineOptions {
  script_mode?: boolean;
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

function emit_line(context: CliContext, channel: CliChannel, line: string): void {
  if (context.channel_bus) {
    context.channel_bus.emit({ channel, text: line });
    return;
  }
  process.stdout.write(`${line}\n`);
}

function emit_event(context: CliContext, line: string, event: DomainEvent, event_index: number): void {
  if (context.channel_bus) {
    context.channel_bus.emit({
      channel: 'event',
      text: line,
      event,
      event_index
    });
    return;
  }
  process.stdout.write(`${line}\n`);
}

function emit_state_snapshot(context: CliContext, text: string): void {
  if (context.channel_bus) {
    context.channel_bus.emit({
      channel: 'state',
      text,
      state_snapshot: context.state
    });
    return;
  }
  emit_text(context, 'state', text);
}

function emit_text(context: CliContext, channel: CliChannel, text: string): void {
  const lines = text.split('\n');
  lines.forEach((line) => {
    emit_line(context, channel, line);
  });
}

function make_command_id(context: CliContext): string {
  const id = `cli-${String(context.next_command_index).padStart(6, '0')}`;
  context.next_command_index += 1;
  return id;
}

export function create_cli_context(initial_game_id: string, options?: { channel_bus?: CliChannelBus }): CliContext {
  const context: CliContext = {
    state: create_initial_state(initial_game_id),
    event_log: [],
    next_command_index: 1,
    plugin_registry: new PluginRegistry([
      chef_plugin,
      butler_plugin,
      empath_plugin,
      fortune_teller_plugin,
      imp_plugin,
      investigator_plugin,
      librarian_plugin,
      mayor_plugin,
      monk_plugin,
      poisoner_plugin,
      ravenkeeper_plugin,
      recluse_plugin,
      scarlet_woman_plugin,
      saint_plugin,
      slayer_plugin,
      soldier_plugin,
      spy_plugin,
      undertaker_plugin,
      virgin_plugin,
      washerwoman_plugin
    ])
  };

  if (options?.channel_bus) {
    context.channel_bus = options.channel_bus;
  }

  return context;
}

function create_stdout_channel_context(initial_game_id: string): CliContext {
  const channel_bus = new CliChannelBus();
  channel_bus.subscribe('*', (message) => {
    process.stdout.write(`${message.text}\n`);
  });
  return create_cli_context(initial_game_id, { channel_bus });
}

function run_quick_setup(context: CliContext, script_input: string, player_num: number, game_id?: string): void {
  let quick_setup_seed: ReturnType<typeof build_quick_setup_seed_commands>;
  try {
    const quick_setup_options: Parameters<typeof build_quick_setup_seed_commands>[0] = {
      script_input,
      player_num
    };
    if (game_id) {
      quick_setup_options.game_id = game_id;
    }
    quick_setup_seed = build_quick_setup_seed_commands(quick_setup_options);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    emit_line(context, 'error', `${paint('quick_setup_error', 'red')} ${message}`);
    return;
  }

  const { resolved_game_id, seed_commands, script_id } = quick_setup_seed;

  context.state = create_initial_state(resolved_game_id);
  context.event_log = [];

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
      emit_line(
        context,
        'error',
        `${paint('quick_setup_error', 'red')} code=${result.error.code} message=${result.error.message} command=${command.command_type}`
      );
      return;
    }
    context.state = apply_events(context.state, result.value);
    context.event_log.push(...result.value);
  }

  if (context.event_log.length > 0) {
    emit_line(context, 'status', `${paint('ok', 'green')} emitted=${context.event_log.length}`);
    context.event_log.forEach((event, index) => {
      emit_event(context, format_event(event, index + 1), event, index + 1);
    });
  }

  emit_line(context, 'status', `quick setup complete: script=${script_id} players=${player_num} game=${resolved_game_id}`);
  emit_state_snapshot(context, format_state_brief(context.state));
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
    emit_line(context, 'error', `${paint('engine_error', 'red')} code=${result.error.code} message=${result.error.message}`);
    return false;
  }

  const events = result.value;
  context.state = apply_events(context.state, events);
  context.event_log.push(...events);

  if (events.length === 0) {
    emit_line(context, 'status', `${paint('ok', 'green')} (no events)`);
    return true;
  }

  emit_line(context, 'status', `${paint('ok', 'green')} emitted=${events.length}`);
  const start_index = context.event_log.length - events.length + 1;
  events.forEach((event, event_index) => {
    emit_event(
      context,
      format_event(event, start_index + event_index),
      event,
      start_index + event_index
    );
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
    emit_line(context, 'error', 'vote requires at least one voter');
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
    emit_line(context, 'error', `invalid setup-player type: ${action.character_type}`);
    return;
  }

  const inferred_alignment = infer_alignment_from_type(action.character_type);
  const alignment = action.alignment ?? inferred_alignment;
  if (action.character_type !== 'traveller' && alignment !== inferred_alignment) {
    emit_line(context, 'error', `setup-player alignment mismatch: type=${action.character_type} expects=${inferred_alignment} got=${alignment}`);
    return;
  }

  const assign_character_ok = run_engine_command(context, {
    command_type: 'AssignCharacter',
    payload: {
      player_id: action.player_id,
      true_character_id: action.true_character_id,
      true_character_type: action.character_type,
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

type NextStopReason =
  | 'advanced'
  | 'target_reached'
  | 'blocked_by_prompt'
  | 'blocked_missing_active_vote'
  | 'auto_prompt_guard_hit'
  | 'game_ended'
  | 'failed';

interface NextRunOutcome {
  stop_reason: NextStopReason;
  steps_advanced: number;
  prompts_resolved: number;
}

function pending_prompt_keys(state: GameState): string[] {
  return state.pending_prompts.filter((prompt_key) => {
    const prompt = state.prompts_by_id[prompt_key];
    return Boolean(prompt && prompt.status === 'pending');
  });
}

function resolve_next_pending_prompt(context: CliContext): boolean {
  const prompt_key = pending_prompt_keys(context.state)[0];
  if (!prompt_key) {
    return true;
  }

  return run_engine_command(context, {
    command_type: 'ResolvePrompt',
    payload: {
      prompt_key,
      selected_option_id: random_option_id_for_prompt(context.state, prompt_key),
      freeform: null,
      notes: 'auto_next_prompt'
    }
  });
}

export function resolve_all_pending_prompts(context: CliContext, guard_limit = 100): NextRunOutcome {
  let prompts_resolved = 0;
  while (pending_prompt_keys(context.state).length > 0) {
    if (prompts_resolved >= guard_limit) {
      return {
        stop_reason: 'auto_prompt_guard_hit',
        steps_advanced: 0,
        prompts_resolved
      };
    }

    const resolved = resolve_next_pending_prompt(context);
    if (!resolved) {
      return {
        stop_reason: 'failed',
        steps_advanced: 0,
        prompts_resolved
      };
    }
    prompts_resolved += 1;
  }

  return {
    stop_reason: 'target_reached',
    steps_advanced: 0,
    prompts_resolved
  };
}

function make_repl_prompt(state: GameState): string {
  if (state.pending_prompts.length > 0) {
    return `${paint('clocktower>', 'yellow')} `;
  }
  return 'clocktower> ';
}

function advance_one_step(context: CliContext): NextStopReason {
  if (pending_prompt_keys(context.state).length > 0) {
    return 'blocked_by_prompt';
  }

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
    return 'game_ended';
  }

  if (phase === 'setup') {
    advance_to_phase('first_night', 'dusk', day_number, Math.max(1, night_number));
    return 'advanced';
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
    return 'advanced';
  }

  if (phase === 'day') {
    if (subphase === 'open_discussion') {
      run_engine_command(context, {
        command_type: 'OpenNominationWindow',
        payload: {
          day_number
        }
      });
      return 'advanced';
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
        return 'advanced';
      }

      run_engine_command(context, {
        command_type: 'ResolveExecution',
        payload: {
          day_number: context.state.day_number
        }
      });
      return 'advanced';
    }

    if (subphase === 'vote_in_progress') {
      const active_vote = context.state.day_state.active_vote;
      if (!active_vote) {
        return 'blocked_missing_active_vote';
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
      return 'advanced';
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
        return 'advanced';
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
    return 'advanced';
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
  return 'advanced';
}

export function run_next_phase(
  context: CliContext,
  action: Extract<CliLocalAction, { type: 'next_phase' }>
): NextRunOutcome {
  let prompts_resolved = 0;
  let steps_advanced = 0;

  if (action.auto_prompt) {
    const resolved = resolve_all_pending_prompts(context);
    prompts_resolved += resolved.prompts_resolved;
    if (resolved.stop_reason !== 'target_reached') {
      return {
        stop_reason: resolved.stop_reason,
        steps_advanced,
        prompts_resolved
      };
    }
  }

  if (action.scope === 'phase') {
    const phase_anchor = context.state.phase;
    for (let i = 0; i < 200; i += 1) {
      if (pending_prompt_keys(context.state).length > 0) {
        if (!action.auto_prompt) {
          return {
            stop_reason: 'blocked_by_prompt',
            steps_advanced,
            prompts_resolved
          };
        }
        const resolved = resolve_all_pending_prompts(context);
        prompts_resolved += resolved.prompts_resolved;
        if (resolved.stop_reason !== 'target_reached') {
          return {
            stop_reason: resolved.stop_reason,
            steps_advanced,
            prompts_resolved
          };
        }
      }

      const stop_reason = advance_one_step(context);
      if (stop_reason !== 'advanced') {
        return {
          stop_reason,
          steps_advanced,
          prompts_resolved
        };
      }
      steps_advanced += 1;
      if (context.state.phase !== phase_anchor) {
        return {
          stop_reason: 'target_reached',
          steps_advanced,
          prompts_resolved
        };
      }
    }
    return {
      stop_reason: 'failed',
      steps_advanced,
      prompts_resolved
    };
  }

  if (action.scope === 'subphase') {
    const stop_reason = advance_one_step(context);
    if (stop_reason === 'advanced') {
      steps_advanced += 1;
    }
    return {
      stop_reason,
      steps_advanced,
      prompts_resolved
    };
  }

  const scope_anchor = create_next_scope_anchor(context.state);

  for (let i = 0; i < 200; i += 1) {
    if (pending_prompt_keys(context.state).length > 0) {
      if (!action.auto_prompt) {
        return {
          stop_reason: 'blocked_by_prompt',
          steps_advanced,
          prompts_resolved
        };
      }
      const resolved = resolve_all_pending_prompts(context);
      prompts_resolved += resolved.prompts_resolved;
      if (resolved.stop_reason !== 'target_reached') {
        return {
          stop_reason: resolved.stop_reason,
          steps_advanced,
          prompts_resolved
        };
      }
    }

    const stop_reason = advance_one_step(context);
    if (stop_reason !== 'advanced') {
      return {
        stop_reason,
        steps_advanced,
        prompts_resolved
      };
    }
    steps_advanced += 1;

    if (has_reached_next_scope_target(context.state, action.scope, scope_anchor)) {
      return {
        stop_reason: 'target_reached',
        steps_advanced,
        prompts_resolved
      };
    }
  }

  return {
    stop_reason: 'failed',
    steps_advanced,
    prompts_resolved
  };
}

function handle_local_action(context: CliContext, action: CliLocalAction): boolean {
  if (action.type === 'quit') {
    emit_line(context, 'status', 'bye');
    return false;
  }

  if (action.type === 'help') {
    emit_text(context, 'output', format_help(action.topic ?? 'all'));
    return true;
  }

  if (action.type === 'next_phase') {
    const outcome = run_next_phase(context, action);
    emit_line(context, 'status', `next stop=${outcome.stop_reason} steps=${outcome.steps_advanced} prompts_resolved=${outcome.prompts_resolved}`);
    return true;
  }

  if (action.type === 'state') {
    if (action.format === 'json') {
      emit_state_snapshot(context, format_state_json(context.state));
    } else {
      emit_state_snapshot(context, format_state_brief(context.state));
    }
    return true;
  }

  if (action.type === 'bulk_vote') {
    run_bulk_vote(context, action.nomination_id, action.voter_player_ids, action.in_favor);
    return true;
  }

  if (action.type === 'events') {
    if (context.event_log.length === 0) {
      emit_line(context, 'event', 'no events');
      return true;
    }
    const count = Math.max(0, action.count);
    const start = Math.max(0, context.event_log.length - count);
    context.event_log.slice(start).forEach((event, index) => {
      emit_event(context, format_event(event, start + index + 1), event, start + index + 1);
    });
    return true;
  }

  if (action.type === 'players') {
    emit_text(context, 'output', format_players_table(context.state));
    return true;
  }

  if (action.type === 'player') {
    const player = context.state.players_by_id[action.player_id];
    if (!player) {
      emit_line(context, 'error', `player not found: ${action.player_id}`);
      return true;
    }
    emit_text(context, 'output', format_player(player));
    return true;
  }

  if (action.type === 'view_storyteller') {
    const projection = project_for_storyteller(context.state);
    if (action.json) {
      emit_text(context, 'output', format_projection_json(projection));
    } else {
      emit_text(context, 'output', format_storyteller_projection(projection));
    }
    return true;
  }

  if (action.type === 'view_public') {
    const projection = project_for_public(context.state);
    if (action.json) {
      emit_text(context, 'output', format_projection_json(projection));
    } else {
      emit_text(context, 'output', format_public_projection(projection));
    }
    return true;
  }

  if (action.type === 'view_player') {
    const projected = project_for_player(context.state, action.player_id);
    if (!projected.ok) {
      emit_line(context, 'error', `projection_error code=${projected.error.code} message=${projected.error.message}`);
      return true;
    }
    if (action.json) {
      emit_text(context, 'output', format_projection_json(projected.value));
    } else {
      emit_text(context, 'output', format_player_projection(projected.value));
    }
    return true;
  }

  if (action.type === 'setup_player') {
    run_setup_player(context, action);
    return true;
  }

  if (action.type === 'prompts') {
    emit_text(context, 'output', format_prompt_list(context.state));
    return true;
  }

  if (action.type === 'prompt') {
    const prompt = context.state.prompts_by_id[action.prompt_key];
    if (!prompt) {
      emit_line(context, 'error', `prompt not found: ${action.prompt_key}`);
      return true;
    }
    emit_text(context, 'output', format_prompt(prompt));
    return true;
  }

  if (action.type === 'markers') {
    emit_text(context, 'output', format_marker_list(context.state));
    return true;
  }

  if (action.type === 'marker') {
    const marker = context.state.reminder_markers_by_id[action.marker_id];
    if (!marker) {
      emit_line(context, 'error', `marker not found: ${action.marker_id}`);
      return true;
    }
    emit_text(context, 'output', format_marker(marker));
    return true;
  }

  if (action.type === 'new_game') {
    context.state = create_initial_state(action.game_id);
    context.event_log = [];
    emit_line(context, 'status', `created game ${action.game_id}`);
    emit_state_snapshot(context, format_state_brief(context.state));
    return true;
  }

  if (action.type === 'quick_setup') {
    run_quick_setup(context, action.script, action.player_num, action.game_id);
    return true;
  }

  return true;
}

export function process_cli_line(context: CliContext, line: string, options?: ProcessLineOptions): boolean {
  const script_mode = options?.script_mode ?? false;
  const parse_options = options?.script_mode ? { script_mode: true } : undefined;
  const parsed = parse_cli_line(line, context.state, parse_options);
  if (!parsed.ok) {
    emit_line(context, 'error', parsed.message);
    return !script_mode;
  }

  if (parsed.kind === 'empty') {
    return true;
  }

  if (parsed.kind === 'local') {
    return handle_local_action(context, parsed.action);
  }

  const command_ok = run_engine_command(context, parsed.command);
  if (!command_ok && !script_mode) {
    return true;
  }
  return command_ok;
}

export async function run_cli_script_file(script_path: string, initial_game_id = 'cli_game'): Promise<void> {
  const context = create_stdout_channel_context(initial_game_id);
  const raw = await readFile(script_path, 'utf8');
  const lines = raw.split(/\r?\n/);

  emit_line(context, 'status', `running script: ${script_path}`);
  emit_state_snapshot(context, format_state_brief(context.state));

  for (let index = 0; index < lines.length; index += 1) {
    const original = lines[index] ?? '';
    const line = original.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    emit_line(context, 'status', `> ${line}`);
    const ok = process_cli_line(context, line, { script_mode: true });
    if (!ok) {
      throw new Error(`script failed at line ${index + 1}: ${line}`);
    }
  }

  emit_line(context, 'status', 'script complete');
  emit_state_snapshot(context, format_state_brief(context.state));
}

export async function start_cli_repl(initial_game_id = 'cli_game'): Promise<void> {
  const context = create_stdout_channel_context(initial_game_id);

  process.stdout.write('Clocktower Engine CLI (Phase 5)\n');
  process.stdout.write(`${paint('type "help" for commands', 'yellow')}\n`);
  process.stdout.write(`${format_state_brief(context.state)}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'clocktower> '
  });

  const prompt_again = (): void => {
    rl.setPrompt(make_repl_prompt(context.state));
    rl.prompt();
  };

  prompt_again();

  rl.on('line', (line) => {
    const keep_running = process_cli_line(context, line);
    if (!keep_running) {
      rl.close();
      return;
    }
    prompt_again();
  });

  await new Promise<void>((resolve) => {
    rl.on('close', () => {
      resolve();
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const script_flag_index = args.findIndex((arg) => arg === '--script' || arg === '-s');

  const run = script_flag_index >= 0
    ? async () => {
        const script_path = args[script_flag_index + 1];
        if (!script_path) {
          throw new Error('usage: cli --script <path> [game_id]');
        }
        const game_id = args[script_flag_index + 2] ?? 'cli_game';
        await run_cli_script_file(script_path, game_id);
      }
    : async () => {
        const game_id = args[0] ?? 'cli_game';
        await start_cli_repl(game_id);
      };

  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`fatal: ${message}\n`);
    process.exitCode = 1;
  });
}
