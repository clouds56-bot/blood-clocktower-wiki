import type { Command, ResolvePromptCommand } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import { apply_events } from '../domain/reducer.js';
import type { GameState } from '../domain/types.js';
import {
  dispatch_hook,
  type HookDispatchError,
  type HookDispatchSuccess,
  type NormalizedHookOutput
} from '../plugins/dispatcher.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type { EngineResult } from './phase-machine.js';
import { collect_night_wake_steps } from './night-flow.js';

interface RuntimeContext {
  state: GameState;
  command: Command;
  created_at: string;
  observer?: PluginRuntimeObserver;
}

export interface PluginDispatchDebugRecord {
  hook_name: string;
  plugin_ids: string[];
  ok: boolean;
  trace: HookDispatchSuccess['trace'] | HookDispatchError['trace'];
  emitted_events: number;
  queued_prompts: number;
  queued_interrupts: number;
  error_code: string | null;
  error_message: string | null;
}

export interface PluginRuntimeObserver {
  on_dispatch: (record: PluginDispatchDebugRecord) => void;
}

export function integrate_plugin_runtime(
  state: GameState,
  command: Command,
  created_at: string,
  base_events: DomainEvent[],
  plugin_registry?: PluginRegistry,
  observer?: PluginRuntimeObserver
): EngineResult<DomainEvent[]> {
  if (!plugin_registry) {
    return {
      ok: true,
      value: base_events
    };
  }

  let runtime_state = apply_events(state, base_events);
  const runtime_events: DomainEvent[] = [];

  const context: RuntimeContext = {
    state,
    command,
    created_at,
    ...(observer ? { observer } : {})
  };

  if (command.command_type === 'AdvancePhase' && is_night_wake_boundary(runtime_state)) {
    if (runtime_state.wake_queue.length === 0) {
      const wake_steps = collect_night_wake_steps(runtime_state, plugin_registry);
      for (const [wake_index, wake_step] of wake_steps.entries()) {
        const wake_scheduled: DomainEvent = {
          event_id: `${command.command_id}:WakeScheduled:${wake_index}`,
          event_type: 'WakeScheduled',
          created_at,
          actor_id: command.actor_id,
          payload: {
            wake_id: wake_step.wake_id,
            character_id: wake_step.character_id,
            player_id: wake_step.player_id
          }
        };
        runtime_events.push(wake_scheduled);
        runtime_state = apply_events(runtime_state, [wake_scheduled]);
      }
    }

    const wake_processing = process_wake_queue(
      runtime_state,
      plugin_registry,
      context,
      runtime_events,
      `${command.command_id}:NightWake`
    );
    if (!wake_processing.ok) {
      return wake_processing;
    }
    runtime_state = wake_processing.value;
  }

  if (command.command_type === 'ResolvePrompt') {
    const prompt_owner_plugin_id = resolve_prompt_owner_plugin_id(state, command);
    if (prompt_owner_plugin_id !== null) {
      const plugin_ids = [prompt_owner_plugin_id];
      const dispatch = dispatch_hook(
        plugin_registry,
        'on_prompt_resolved',
        plugin_ids,
        {
          state: runtime_state,
          prompt_id: command.payload.prompt_id,
          selected_option_id: command.payload.selected_option_id,
          freeform: command.payload.freeform
        }
      );
      emit_dispatch_debug(context.observer, 'on_prompt_resolved', plugin_ids, dispatch);

      if (!dispatch.ok) {
        return as_dispatch_error(dispatch.error.code, dispatch.error.message);
      }

      const normalized = normalize_dispatch_output(
        dispatch.value.output,
        `${command.command_id}:PromptResolved`,
        created_at,
        command.actor_id
      );

      const prompt_id_check = validate_queued_prompt_ids(runtime_state, normalized);
      if (!prompt_id_check.ok) {
        return prompt_id_check;
      }

      runtime_events.push(...normalized);
      runtime_state = apply_events(runtime_state, normalized);

      const drained = drain_interrupt_queue(runtime_state, context, runtime_events);
      runtime_state = drained.state;

      if (is_night_wake_boundary(runtime_state) && runtime_state.pending_prompts.length === 0) {
        const wake_processing = process_wake_queue(
          runtime_state,
          plugin_registry,
          context,
          runtime_events,
          `${command.command_id}:ResumeNightWake`
        );
        if (!wake_processing.ok) {
          return wake_processing;
        }
        runtime_state = wake_processing.value;
      }
    }
  }

  return {
    ok: true,
    value: [...base_events, ...runtime_events]
  };
}

function is_night_wake_boundary(state: GameState): boolean {
  const is_night_phase = state.phase === 'first_night' || state.phase === 'night';
  return is_night_phase && state.subphase === 'night_wake_sequence';
}

function normalize_dispatch_output(
  output: NormalizedHookOutput,
  event_id_prefix: string,
  created_at: string,
  fallback_actor_id?: string
): DomainEvent[] {
  const normalized: DomainEvent[] = [];

  for (const [index, item] of output.emitted_events.entries()) {
    normalized.push({
      event_id: `${event_id_prefix}:EmittedEvent:${index}`,
      event_type: item.event_type,
      created_at,
      ...(item.actor_id === undefined
        ? fallback_actor_id === undefined
          ? {}
          : { actor_id: fallback_actor_id }
        : { actor_id: item.actor_id }),
      payload: structuredClone(item.payload)
    } as DomainEvent);
  }

  for (const [index, item] of output.queued_prompts.entries()) {
    normalized.push({
      event_id: `${event_id_prefix}:PromptQueued:${index}`,
      event_type: 'PromptQueued',
      created_at,
      ...(fallback_actor_id === undefined ? {} : { actor_id: fallback_actor_id }),
      payload: {
        prompt_id: item.prompt_id,
        kind: item.kind,
        reason: item.reason,
        visibility: item.visibility,
        options: item.options.map((option) => ({ ...option }))
      }
    });
  }

  for (const [index, item] of output.queued_interrupts.entries()) {
    normalized.push({
      event_id: `${event_id_prefix}:InterruptScheduled:${index}`,
      event_type: 'InterruptScheduled',
      created_at,
      ...(fallback_actor_id === undefined ? {} : { actor_id: fallback_actor_id }),
      payload: {
        interrupt_id: item.interrupt_id,
        kind: item.kind,
        source_plugin_id: item.source_plugin_id,
        payload: structuredClone(item.payload)
      }
    });
  }

  return normalized;
}

function resolve_prompt_owner_plugin_id(
  state: GameState,
  command: ResolvePromptCommand
): string | null {
  const prompt = state.prompts_by_id[command.payload.prompt_id];
  if (!prompt) {
    return null;
  }

  const reason_match = /^plugin:([a-z0-9_-]+):/.exec(prompt.reason);
  if (reason_match) {
    return reason_match[1] ?? null;
  }

  const prompt_match = /^plugin:([a-z0-9_-]+):/.exec(prompt.prompt_id);
  if (prompt_match) {
    return prompt_match[1] ?? null;
  }

  return null;
}

function drain_interrupt_queue(
  state: GameState,
  context: RuntimeContext,
  sink: DomainEvent[]
): {
  state: GameState;
} {
  let runtime_state = state;

  while (runtime_state.interrupt_queue.length > 0) {
    const next_interrupt = runtime_state.interrupt_queue[0];
    if (!next_interrupt) {
      break;
    }

    const interrupt_consumed: DomainEvent = {
      event_id: `${context.command.command_id}:InterruptConsumed:${sink.length}`,
      event_type: 'InterruptConsumed',
      created_at: context.created_at,
      ...(context.command.actor_id === undefined ? {} : { actor_id: context.command.actor_id }),
      payload: {
        interrupt_id: next_interrupt.interrupt_id
      }
    };

    sink.push(interrupt_consumed);
    runtime_state = apply_events(runtime_state, [interrupt_consumed]);
  }

  return {
    state: runtime_state
  };
}

function as_dispatch_error(code: string, message: string): EngineResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function validate_queued_prompt_ids(
  state: GameState,
  events: DomainEvent[]
): EngineResult<void> {
  const seenPromptIds = new Set<string>();

  for (const event of events) {
    if (event.event_type !== 'PromptQueued') {
      continue;
    }

    const prompt_id = event.payload.prompt_id;
    if (state.prompts_by_id[prompt_id] || seenPromptIds.has(prompt_id)) {
      return {
        ok: false,
        error: {
          code: 'prompt_id_already_exists',
          message: `prompt already exists: ${prompt_id}`
        }
      };
    }

    seenPromptIds.add(prompt_id);
  }

  return {
    ok: true,
    value: undefined
  };
}

function emit_dispatch_debug(
  observer: PluginRuntimeObserver | undefined,
  hook_name: string,
  plugin_ids: string[],
  dispatch:
    | {
        ok: true;
        value: HookDispatchSuccess;
      }
    | {
        ok: false;
        error: HookDispatchError;
      }
): void {
  if (!observer) {
    return;
  }

  if (dispatch.ok) {
    observer.on_dispatch({
      hook_name,
      plugin_ids: [...plugin_ids],
      ok: true,
      trace: dispatch.value.trace,
      emitted_events: dispatch.value.output.emitted_events.length,
      queued_prompts: dispatch.value.output.queued_prompts.length,
      queued_interrupts: dispatch.value.output.queued_interrupts.length,
      error_code: null,
      error_message: null
    });
    return;
  }

  observer.on_dispatch({
    hook_name,
    plugin_ids: [...plugin_ids],
    ok: false,
    trace: dispatch.error.trace,
    emitted_events: 0,
    queued_prompts: 0,
    queued_interrupts: 0,
    error_code: dispatch.error.code,
    error_message: dispatch.error.message
  });
}

function process_wake_queue(
  state: GameState,
  plugin_registry: PluginRegistry,
  context: RuntimeContext,
  sink: DomainEvent[],
  event_id_prefix: string
): EngineResult<GameState> {
  let runtime_state = state;
  let wake_index = 0;

  while (runtime_state.wake_queue.length > 0) {
    if (runtime_state.pending_prompts.length > 0) {
      break;
    }

    const wake_step = runtime_state.wake_queue[0];
    if (!wake_step) {
      break;
    }

    const wake_player = runtime_state.players_by_id[wake_step.player_id];
    const wake_plugin = plugin_registry.get(wake_step.character_id);
    const ability_blocked =
      !wake_player ||
      !wake_plugin ||
      (!wake_player.alive && !wake_plugin.metadata.flags.can_function_while_dead);

    if (ability_blocked) {
      const wake_consumed: DomainEvent = {
        event_id: `${event_id_prefix}:WakeConsumed:${wake_index}`,
        event_type: 'WakeConsumed',
        created_at: context.created_at,
        ...(context.command.actor_id === undefined ? {} : { actor_id: context.command.actor_id }),
        payload: {
          wake_id: wake_step.wake_id
        }
      };
      sink.push(wake_consumed);
      runtime_state = apply_events(runtime_state, [wake_consumed]);
      wake_index += 1;
      continue;
    }

    const plugin_ids = [wake_step.character_id];
    const dispatch = dispatch_hook(plugin_registry, 'on_night_wake', plugin_ids, {
      state: runtime_state,
      player_id: wake_step.player_id,
      wake_step_id: wake_step.wake_id
    });
    emit_dispatch_debug(context.observer, 'on_night_wake', plugin_ids, dispatch);

    if (!dispatch.ok) {
      return as_dispatch_error(dispatch.error.code, dispatch.error.message);
    }

    const normalized = normalize_dispatch_output(
      dispatch.value.output,
      `${event_id_prefix}:${wake_index}`,
      context.created_at,
      context.command.actor_id
    );

    const prompt_id_check = validate_queued_prompt_ids(runtime_state, normalized);
    if (!prompt_id_check.ok) {
      return prompt_id_check;
    }

    sink.push(...normalized);
    runtime_state = apply_events(runtime_state, normalized);

    const wake_consumed: DomainEvent = {
      event_id: `${event_id_prefix}:WakeConsumed:${wake_index}`,
      event_type: 'WakeConsumed',
      created_at: context.created_at,
      ...(context.command.actor_id === undefined ? {} : { actor_id: context.command.actor_id }),
      payload: {
        wake_id: wake_step.wake_id
      }
    };
    sink.push(wake_consumed);
    runtime_state = apply_events(runtime_state, [wake_consumed]);

    const drained = drain_interrupt_queue(runtime_state, context, sink);
    runtime_state = drained.state;
    wake_index += 1;
  }

  return {
    ok: true,
    value: runtime_state
  };
}
