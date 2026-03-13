import type { Command, ResolvePromptCommand } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import { apply_events } from '../domain/reducer.js';
import type { GameState } from '../domain/types.js';
import { dispatch_hook } from '../plugins/dispatcher.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type { EngineResult } from './phase-machine.js';
import { collect_night_wake_steps } from './night-flow.js';

interface RuntimeContext {
  state: GameState;
  command: Command;
  created_at: string;
}

export function integrate_plugin_runtime(
  state: GameState,
  command: Command,
  created_at: string,
  base_events: DomainEvent[],
  plugin_registry?: PluginRegistry
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
    created_at
  };

  if (is_night_wake_boundary(runtime_state)) {
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

      const dispatch = dispatch_hook(
        plugin_registry,
        'on_night_wake',
        [wake_step.character_id],
        {
          state: runtime_state,
          player_id: wake_step.player_id,
          wake_step_id: wake_step.wake_id
        }
      );

      if (!dispatch.ok) {
        return as_dispatch_error(dispatch.error.code, dispatch.error.message);
      }

      const normalized = normalize_dispatch_output(
        dispatch.value.output,
        `${command.command_id}:NightWake:${wake_index}`,
        created_at,
        command.actor_id
      );

      runtime_events.push(...normalized);
      runtime_state = apply_events(runtime_state, normalized);

      const wake_consumed: DomainEvent = {
        event_id: `${command.command_id}:WakeConsumed:${wake_index}`,
        event_type: 'WakeConsumed',
        created_at,
        actor_id: command.actor_id,
        payload: {
          wake_id: wake_step.wake_id
        }
      };
      runtime_events.push(wake_consumed);
      runtime_state = apply_events(runtime_state, [wake_consumed]);

      const drained = drain_interrupt_queue(runtime_state, context, runtime_events);
      runtime_state = drained.state;
    }
  }

  if (command.command_type === 'ResolvePrompt') {
    const prompt_owner_plugin_id = resolve_prompt_owner_plugin_id(state, command);
    if (prompt_owner_plugin_id !== null) {
      const dispatch = dispatch_hook(
        plugin_registry,
        'on_prompt_resolved',
        [prompt_owner_plugin_id],
        {
          state: runtime_state,
          prompt_id: command.payload.prompt_id,
          selected_option_id: command.payload.selected_option_id,
          freeform: command.payload.freeform
        }
      );

      if (!dispatch.ok) {
        return as_dispatch_error(dispatch.error.code, dispatch.error.message);
      }

      const normalized = normalize_dispatch_output(
        dispatch.value.output,
        `${command.command_id}:PromptResolved`,
        created_at,
        command.actor_id
      );

      runtime_events.push(...normalized);
      runtime_state = apply_events(runtime_state, normalized);

      const drained = drain_interrupt_queue(runtime_state, context, runtime_events);
      runtime_state = drained.state;
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
  output: {
    emitted_events: Array<{
      event_type: DomainEvent['event_type'];
      payload: Record<string, unknown>;
      actor_id?: string;
    }>;
    queued_prompts: Array<{
      prompt_id: string;
      kind: string;
      reason: string;
      visibility: 'storyteller' | 'player' | 'public';
      options: Array<{
        option_id: string;
        label: string;
      }>;
    }>;
    queued_interrupts: Array<{
      interrupt_id: string;
      kind: string;
      source_plugin_id: string;
      payload: Record<string, unknown>;
    }>;
  },
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
