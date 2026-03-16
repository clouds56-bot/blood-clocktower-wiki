import type {
  CharacterPlugin,
  EventAppliedHookContext,
  NominationMadeHookContext,
  NightWakeHookContext,
  PlayerDiedHookContext,
  PluginEventSpec,
  PluginInterruptSpec,
  PluginPromptSpec,
  PluginResult,
  PromptResolvedHookContext,
  RegistrationResolvedHookContext
} from './contracts.js';
import { empty_plugin_result } from './contracts.js';
import type { VoteCastValidateHookContext } from './contracts.js';
import type { PluginRegistry } from './registry.js';

export type DispatchHookName =
  | 'on_night_wake'
  | 'on_prompt_resolved'
  | 'on_registration_resolved'
  | 'on_event_applied'
  | 'on_nomination_made'
  | 'on_player_died';

type DispatchContextByHook = {
  on_night_wake: NightWakeHookContext;
  on_prompt_resolved: PromptResolvedHookContext;
  on_registration_resolved: RegistrationResolvedHookContext;
  on_event_applied: EventAppliedHookContext;
  on_nomination_made: NominationMadeHookContext;
  on_player_died: PlayerDiedHookContext;
};

export interface HookDispatchIssue {
  code: string;
  message: string;
  plugin_id?: string;
  path?: string;
}

export interface HookDispatchTrace {
  plugin_id: string;
  status: 'executed' | 'skipped_missing_plugin' | 'skipped_missing_hook';
  emitted_events: number;
  queued_prompts: number;
  queued_interrupts: number;
}

export interface NormalizedHookOutput {
  emitted_events: PluginEventSpec[];
  queued_prompts: PluginPromptSpec[];
  queued_interrupts: PluginInterruptSpec[];
}

export interface HookDispatchSuccess {
  hook_name: DispatchHookName;
  output: NormalizedHookOutput;
  trace: HookDispatchTrace[];
}

export interface HookDispatchError {
  code: 'plugin_hook_dispatch_failed';
  message: string;
  issues: HookDispatchIssue[];
  trace: HookDispatchTrace[];
}

export type HookDispatchResult =
  | {
      ok: true;
      value: HookDispatchSuccess;
    }
  | {
      ok: false;
      error: HookDispatchError;
    };

export interface VoteCastValidateTrace {
  plugin_id: string;
  status: 'executed' | 'skipped_missing_plugin' | 'skipped_missing_hook';
}

export type VoteCastValidateResult =
  | {
      ok: true;
      trace: VoteCastValidateTrace[];
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        plugin_id?: string;
        trace: VoteCastValidateTrace[];
      };
    };

export function dispatch_hook<K extends DispatchHookName>(
  registry: PluginRegistry,
  hook_name: K,
  plugin_ids: string[],
  context: DispatchContextByHook[K]
): HookDispatchResult {
  const issues: HookDispatchIssue[] = [];
  const trace: HookDispatchTrace[] = [];
  const output: NormalizedHookOutput = empty_plugin_result();

  const seenPluginIds = new Set<string>();
  for (const plugin_id of plugin_ids) {
    if (seenPluginIds.has(plugin_id)) {
      continue;
    }
    seenPluginIds.add(plugin_id);

    const plugin = registry.get(plugin_id);
    if (!plugin) {
      trace.push({
        plugin_id,
        status: 'skipped_missing_plugin',
        emitted_events: 0,
        queued_prompts: 0,
        queued_interrupts: 0
      });
      continue;
    }

    const hook = plugin.hooks[hook_name];
    if (!hook) {
      trace.push({
        plugin_id,
        status: 'skipped_missing_hook',
        emitted_events: 0,
        queued_prompts: 0,
        queued_interrupts: 0
      });
      continue;
    }

    const plugin_result = invoke_plugin_hook(plugin, hook_name, context);
    if (!plugin_result.ok) {
      issues.push(plugin_result.error);
      trace.push({
        plugin_id,
        status: 'executed',
        emitted_events: 0,
        queued_prompts: 0,
        queued_interrupts: 0
      });
      continue;
    }

    const normalized = normalize_plugin_result(plugin_id, plugin_result.value);
    issues.push(...normalized.issues);

    output.emitted_events.push(...normalized.output.emitted_events);
    output.queued_prompts.push(...normalized.output.queued_prompts);
    output.queued_interrupts.push(...normalized.output.queued_interrupts);

    trace.push({
      plugin_id,
      status: 'executed',
      emitted_events: normalized.output.emitted_events.length,
      queued_prompts: normalized.output.queued_prompts.length,
      queued_interrupts: normalized.output.queued_interrupts.length
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: {
        code: 'plugin_hook_dispatch_failed',
        message: `failed to dispatch ${hook_name}; ${issues.length} issue(s) detected`,
        issues,
        trace
      }
    };
  }

  return {
    ok: true,
    value: {
      hook_name,
      output,
      trace
    }
  };
}

export function dispatch_vote_cast_validate(
  registry: PluginRegistry,
  plugin_ids: string[],
  context: VoteCastValidateHookContext
): VoteCastValidateResult {
  const trace: VoteCastValidateTrace[] = [];
  const seen_plugin_ids = new Set<string>();

  for (const plugin_id of plugin_ids) {
    if (seen_plugin_ids.has(plugin_id)) {
      continue;
    }
    seen_plugin_ids.add(plugin_id);

    const plugin = registry.get(plugin_id);
    if (!plugin) {
      trace.push({
        plugin_id,
        status: 'skipped_missing_plugin'
      });
      continue;
    }

    const hook = plugin.hooks.on_vote_cast_validate;
    if (!hook) {
      trace.push({
        plugin_id,
        status: 'skipped_missing_hook'
      });
      continue;
    }

    trace.push({
      plugin_id,
      status: 'executed'
    });

    try {
      const result = hook(context);
      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            plugin_id,
            trace
          }
        };
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'unknown plugin hook error';
      return {
        ok: false,
        error: {
          code: 'plugin_hook_threw',
          message,
          plugin_id,
          trace
        }
      };
    }
  }

  return {
    ok: true,
    trace
  };
}

function invoke_plugin_hook<K extends DispatchHookName>(
  plugin: CharacterPlugin,
  hook_name: K,
  context: DispatchContextByHook[K]
):
  | {
      ok: true;
      value: PluginResult;
    }
  | {
      ok: false;
      error: HookDispatchIssue;
    } {
  try {
    const hook = plugin.hooks[hook_name];
    if (!hook) {
      return {
        ok: true,
        value: empty_plugin_result()
      };
    }

    const value = hook(context as never);
    return {
      ok: true,
      value
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unknown plugin hook error';
    return {
      ok: false,
      error: {
        code: 'plugin_hook_threw',
        message,
        plugin_id: plugin.metadata.id,
        path: hook_name
      }
    };
  }
}

function normalize_plugin_result(
  plugin_id: string,
  result: PluginResult
): {
  output: NormalizedHookOutput;
  issues: HookDispatchIssue[];
} {
  const issues: HookDispatchIssue[] = [];

  const normalized_events = result.emitted_events.map((item, index) => {
    if (item.actor_id !== undefined && item.actor_id.trim().length === 0) {
      issues.push({
        code: 'invalid_plugin_event_actor_id',
        message: 'event actor_id must not be empty when provided',
        plugin_id,
        path: `emitted_events.${index}.actor_id`
      });
    }

    return {
      event_type: item.event_type,
      payload: structuredClone(item.payload),
      ...(item.actor_id === undefined ? {} : { actor_id: item.actor_id })
    } satisfies PluginEventSpec;
  });

  const normalized_prompts = result.queued_prompts.map((item, prompt_index) => {
    if (item.prompt_id.trim().length === 0) {
      issues.push({
        code: 'invalid_plugin_prompt_id',
        message: 'prompt_id must be non-empty',
        plugin_id,
        path: `queued_prompts.${prompt_index}.prompt_id`
      });
    }
    if (item.kind.trim().length === 0) {
      issues.push({
        code: 'invalid_plugin_prompt_kind',
        message: 'prompt kind must be non-empty',
        plugin_id,
        path: `queued_prompts.${prompt_index}.kind`
      });
    }
    if (item.reason.trim().length === 0) {
      issues.push({
        code: 'invalid_plugin_prompt_reason',
        message: 'prompt reason must be non-empty',
        plugin_id,
        path: `queued_prompts.${prompt_index}.reason`
      });
    }

    const seenOptionIds = new Set<string>();
    const selection_mode = item.selection_mode ?? 'single_choice';

    const normalized_options = item.options.map((option, option_index) => {
      if (option.option_id.trim().length === 0) {
        issues.push({
          code: 'invalid_plugin_prompt_option_id',
          message: 'prompt option_id must be non-empty',
          plugin_id,
          path: `queued_prompts.${prompt_index}.options.${option_index}.option_id`
        });
      }
      if (option.label.trim().length === 0) {
        issues.push({
          code: 'invalid_plugin_prompt_option_label',
          message: 'prompt option label must be non-empty',
          plugin_id,
          path: `queued_prompts.${prompt_index}.options.${option_index}.label`
        });
      }
      if (seenOptionIds.has(option.option_id)) {
        issues.push({
          code: 'duplicate_plugin_prompt_option_id',
          message: `duplicate option_id ${option.option_id} in prompt`,
          plugin_id,
          path: `queued_prompts.${prompt_index}.options.${option_index}.option_id`
        });
      }
      seenOptionIds.add(option.option_id);

      return {
        option_id: option.option_id,
        label: option.label
      };
    });

    if (selection_mode === 'number_range' && !item.number_range) {
      issues.push({
        code: 'invalid_plugin_prompt_number_range',
        message: 'number_range prompt requires number_range field',
        plugin_id,
        path: `queued_prompts.${prompt_index}.number_range`
      });
    }

    if (selection_mode === 'multi_column' && (!item.multi_columns || item.multi_columns.length === 0)) {
      issues.push({
        code: 'invalid_plugin_prompt_multi_columns',
        message: 'multi_column prompt requires multi_columns field',
        plugin_id,
        path: `queued_prompts.${prompt_index}.multi_columns`
      });
    }

    return {
      prompt_id: item.prompt_id,
      kind: item.kind,
      reason: item.reason,
      visibility: item.visibility,
      options: normalized_options,
      selection_mode,
      number_range: item.number_range ? { ...item.number_range } : null,
      multi_columns: item.multi_columns
        ? item.multi_columns.map((column) => (Array.isArray(column) ? [...column] : { ...column }))
        : null,
      storyteller_hint: item.storyteller_hint ?? null
    } satisfies PluginPromptSpec;
  });

  const seenInterruptIds = new Set<string>();
  const normalized_interrupts = result.queued_interrupts.map((item, index) => {
    if (item.interrupt_id.trim().length === 0) {
      issues.push({
        code: 'invalid_plugin_interrupt_id',
        message: 'interrupt_id must be non-empty',
        plugin_id,
        path: `queued_interrupts.${index}.interrupt_id`
      });
    }
    if (item.kind.trim().length === 0) {
      issues.push({
        code: 'invalid_plugin_interrupt_kind',
        message: 'interrupt kind must be non-empty',
        plugin_id,
        path: `queued_interrupts.${index}.kind`
      });
    }
    if (seenInterruptIds.has(item.interrupt_id)) {
      issues.push({
        code: 'duplicate_plugin_interrupt_id',
        message: `duplicate interrupt_id ${item.interrupt_id}`,
        plugin_id,
        path: `queued_interrupts.${index}.interrupt_id`
      });
    }
    seenInterruptIds.add(item.interrupt_id);

    return {
      interrupt_id: item.interrupt_id,
      kind: item.kind,
      source_plugin_id: plugin_id,
      payload: structuredClone(item.payload)
    } satisfies PluginInterruptSpec;
  });

  return {
    output: {
      emitted_events: normalized_events,
      queued_prompts: normalized_prompts,
      queued_interrupts: normalized_interrupts
    },
    issues
  };
}
