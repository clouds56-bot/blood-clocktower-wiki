import type { Command, ResolvePromptCommand } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import { apply_events } from '../domain/reducer.js';
import type { GameState } from '../domain/types.js';
import {
  parse_registration_prompt_id,
  resolve_registration_query_prompt
} from '../plugins/characters/tb-info-utils.js';
import { dispatch_hook, type NormalizedHookOutput } from '../plugins/dispatcher.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type { EngineResult } from './phase-machine.js';
import { collect_night_wake_steps } from './night-flow.js';

interface RuntimeContext {
  state: GameState;
  command: Command;
  created_at: string;
}

interface ParsedClaimedAbilityPrompt {
  claimed_character_id: string;
  claimant_player_id: string;
}

function resolve_prompt_key(command: ResolvePromptCommand): string {
  return command.payload.prompt_key;
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

  if (command.command_type === 'UseClaimedAbility') {
    const dispatch = dispatch_hook(
      plugin_registry,
      'on_claimed_ability_use',
      [command.payload.claimed_character_id],
      {
        state: runtime_state,
        claimant_player_id: command.payload.claimant_player_id,
        claimed_character_id: command.payload.claimed_character_id
      }
    );

    if (!dispatch.ok) {
      return as_dispatch_error(dispatch.error.code, dispatch.error.message);
    }

    const normalized = normalize_dispatch_output(
      dispatch.value.output,
      `${command.command_id}:ClaimedAbilityUse`,
      created_at,
      command.actor_id
    );

    const prompt_id_check = validate_queued_prompt_ids(runtime_state, normalized);
    if (!prompt_id_check.ok) {
      return prompt_id_check;
    }

    runtime_events.push(...normalized);
    const state_before_compat = runtime_state;
    runtime_state = apply_events(runtime_state, normalized);

    const compatibility_events = build_marker_compatibility_events(
      state_before_compat,
      runtime_state,
      normalized,
      `${command.command_id}:ClaimedAbilityUseCompat`,
      created_at,
      command.actor_id
    );
    if (compatibility_events.length > 0) {
      runtime_events.push(...compatibility_events);
      runtime_state = apply_events(runtime_state, compatibility_events);
    }
  }

  if (command.command_type === 'AdvancePhase' && is_night_wake_boundary(runtime_state)) {
    if (runtime_state.wake_queue.length === 0) {
      const wake_steps = collect_night_wake_steps(runtime_state, plugin_registry);
      for (const [wake_index, wake_step] of wake_steps.entries()) {
      const wake_scheduled: DomainEvent = {
          event_key: `${command.command_id}:WakeScheduled:${wake_index}`,
          event_id: 1,
          event_type: 'WakeScheduled',
          created_at,
          actor_id: command.actor_id,
          payload: {
            wake_key: wake_step.wake_key,
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
    const claimed_ability_prompt = parse_claimed_ability_prompt(runtime_state, command);
    if (claimed_ability_prompt) {
      const selected_target_id = command.payload.selected_option_id;
      if (selected_target_id === null) {
        return as_dispatch_error(
          'claimed_ability_target_required',
          'claimed ability prompt requires target selection'
        );
      }

      const attempt_event: DomainEvent = {
        event_key: `${command.command_id}:ClaimedAbilityAttempted`,
        event_id: 1,
        event_type: 'ClaimedAbilityAttempted',
        created_at,
        ...(command.actor_id === undefined ? {} : { actor_id: command.actor_id }),
        payload: {
          claimant_player_id: claimed_ability_prompt.claimant_player_id,
          claimed_character_id: claimed_ability_prompt.claimed_character_id,
          target_player_ids: [selected_target_id]
        }
      };

      runtime_events.push(attempt_event);
      runtime_state = apply_events(runtime_state, [attempt_event]);

      const dispatch = dispatch_hook(
        plugin_registry,
        'on_prompt_resolved',
        [claimed_ability_prompt.claimed_character_id],
        {
          state: runtime_state,
          prompt_key: resolve_prompt_key(command),
          prompt_id: resolve_prompt_key(command),
          selected_option_id: command.payload.selected_option_id,
          freeform: command.payload.freeform
        }
      );

      if (!dispatch.ok) {
        return as_dispatch_error(dispatch.error.code, dispatch.error.message);
      }

      const normalized = normalize_dispatch_output(
        dispatch.value.output,
        `${command.command_id}:ClaimedAbilityPromptResolved`,
        created_at,
        command.actor_id
      );

      const settled_execution_deaths = build_execution_death_events(
        runtime_state,
        normalized,
        `${command.command_id}:ClaimedAbilityPromptResolved:ExecutionSettled`,
        created_at,
        command.actor_id
      );

      const combined = [...normalized, ...settled_execution_deaths];
      const prompt_id_check = validate_queued_prompt_ids(runtime_state, combined);
      if (!prompt_id_check.ok) {
        return prompt_id_check;
      }

      runtime_events.push(...combined);
      const state_before_compat = runtime_state;
      runtime_state = apply_events(runtime_state, combined);

      const compatibility_events = build_marker_compatibility_events(
        state_before_compat,
        runtime_state,
        combined,
        `${command.command_id}:ClaimedAbilityPromptResolvedCompat`,
        created_at,
        command.actor_id
      );
      if (compatibility_events.length > 0) {
        runtime_events.push(...compatibility_events);
        runtime_state = apply_events(runtime_state, compatibility_events);
      }

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
    } else {
    const resolved_prompt_key = resolve_prompt_key(command);
    const registration_prompt = parse_registration_prompt_id(resolved_prompt_key);
    if (registration_prompt) {
      const resolved = resolve_registration_query_prompt({
        state: runtime_state,
        role_id: registration_prompt.consumer_role_id,
        prompt_id: resolve_prompt_key(command),
        selected_option_id: command.payload.selected_option_id
      });
      if (!resolved.ok) {
        return as_dispatch_error('invalid_registration_prompt_resolution', 'invalid registration prompt resolution');
      }

      const registration_decision_event: DomainEvent = {
        event_key: `${command.command_id}:RegistrationResolved:Decision`,
        event_id: 1,
        event_type: resolved.event.event_type,
        created_at,
        ...(command.actor_id === undefined ? {} : { actor_id: command.actor_id }),
        payload: structuredClone(resolved.event.payload)
      } as DomainEvent;
      const decision_payload = resolved.event.payload as Extract<
        DomainEvent,
        { event_type: 'RegistrationDecisionRecorded' }
      >['payload'];

      runtime_events.push(registration_decision_event);
      runtime_state = apply_events(runtime_state, [registration_decision_event]);

      const dispatch = dispatch_hook(
        plugin_registry,
        'on_registration_resolved',
        [registration_prompt.consumer_role_id],
        {
          state: runtime_state,
          prompt_key: resolved_prompt_key,
          prompt_id: resolve_prompt_key(command),
          provider_role_id: resolved.parsed.provider_role_id,
          consumer_role_id: resolved.parsed.consumer_role_id,
          owner_player_id: resolved.parsed.owner_player_id,
          context_tag: resolved.parsed.context_tag,
          query_id: resolved.parsed.query_id,
          selected_option_id: command.payload.selected_option_id,
          freeform: command.payload.freeform,
          decision: {
            query_id: decision_payload.query_id,
            resolved_character_id: decision_payload.resolved_character_id,
            resolved_character_type: decision_payload.resolved_character_type,
            resolved_alignment: decision_payload.resolved_alignment,
            decision_source: decision_payload.decision_source,
            note: decision_payload.note
          }
        }
      );

      if (!dispatch.ok) {
        return as_dispatch_error(dispatch.error.code, dispatch.error.message);
      }

      const normalized = normalize_dispatch_output(
        dispatch.value.output,
        `${command.command_id}:RegistrationResolved`,
        created_at,
        command.actor_id
      );

      const settled_execution_deaths = build_execution_death_events(
        runtime_state,
        normalized,
        `${command.command_id}:RegistrationResolved:ExecutionSettled`,
        created_at,
        command.actor_id
      );

      const combined = [...normalized, ...settled_execution_deaths];
      const prompt_id_check = validate_queued_prompt_ids(runtime_state, combined);
      if (!prompt_id_check.ok) {
        return prompt_id_check;
      }

      runtime_events.push(...combined);
      const state_before_compat = runtime_state;
      runtime_state = apply_events(runtime_state, combined);

      const compatibility_events = build_marker_compatibility_events(
        state_before_compat,
        runtime_state,
        combined,
        `${command.command_id}:RegistrationResolvedCompat`,
        created_at,
        command.actor_id
      );
      if (compatibility_events.length > 0) {
        runtime_events.push(...compatibility_events);
        runtime_state = apply_events(runtime_state, compatibility_events);
      }

      const drained = drain_interrupt_queue(runtime_state, context, runtime_events);
      runtime_state = drained.state;
    } else {
      const prompt_owner_plugin_id = resolve_prompt_owner_plugin_id(state, command);
      if (prompt_owner_plugin_id !== null) {
        const dispatch = dispatch_hook(
          plugin_registry,
          'on_prompt_resolved',
        [prompt_owner_plugin_id],
        {
          state: runtime_state,
          prompt_key: resolve_prompt_key(command),
          prompt_id: resolve_prompt_key(command),
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

      const settled_execution_deaths = build_execution_death_events(
        runtime_state,
        normalized,
        `${command.command_id}:PromptResolved:ExecutionSettled`,
        created_at,
        command.actor_id
      );

      const combined = [...normalized, ...settled_execution_deaths];

      const prompt_id_check = validate_queued_prompt_ids(runtime_state, combined);
      if (!prompt_id_check.ok) {
        return prompt_id_check;
      }

      runtime_events.push(...combined);
      const state_before_compat = runtime_state;
      runtime_state = apply_events(runtime_state, combined);

      const compatibility_events = build_marker_compatibility_events(
        state_before_compat,
        runtime_state,
        combined,
        `${command.command_id}:PromptResolvedCompat`,
        created_at,
        command.actor_id
      );
      if (compatibility_events.length > 0) {
        runtime_events.push(...compatibility_events);
        runtime_state = apply_events(runtime_state, compatibility_events);
      }

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
  }
  }

  if (command.command_type === 'NominatePlayer') {
    const nominee = runtime_state.players_by_id[command.payload.nominee_player_id];
    const nominee_plugin_id = nominee?.true_character_id ?? null;

    if (nominee_plugin_id !== null) {
      const dispatch = dispatch_hook(plugin_registry, 'on_nomination_made', [nominee_plugin_id], {
        state: runtime_state,
        nomination_id: command.payload.nomination_id,
        day_number: command.payload.day_number,
        nominator_player_id: command.payload.nominator_player_id,
        nominee_player_id: command.payload.nominee_player_id
      });

      if (!dispatch.ok) {
        return as_dispatch_error(dispatch.error.code, dispatch.error.message);
      }

      const normalized = normalize_dispatch_output(
        dispatch.value.output,
        `${command.command_id}:NominationMade`,
        created_at,
        command.actor_id
      );

      const settled_execution_deaths = build_execution_death_events(
        runtime_state,
        normalized,
        `${command.command_id}:NominationMade:ExecutionSettled`,
        created_at,
        command.actor_id
      );

      const combined = [...normalized, ...settled_execution_deaths];

      const prompt_id_check = validate_queued_prompt_ids(runtime_state, combined);
      if (!prompt_id_check.ok) {
        return prompt_id_check;
      }

      runtime_events.push(...combined);
      const state_before_compat = runtime_state;
      runtime_state = apply_events(runtime_state, combined);

      const compatibility_events = build_marker_compatibility_events(
        state_before_compat,
        runtime_state,
        combined,
        `${command.command_id}:NominationMadeCompat`,
        created_at,
        command.actor_id
      );
      if (compatibility_events.length > 0) {
        runtime_events.push(...compatibility_events);
        runtime_state = apply_events(runtime_state, compatibility_events);
      }

      const drained = drain_interrupt_queue(runtime_state, context, runtime_events);
      runtime_state = drained.state;
    }
  }

  const player_died_events: DomainEvent[] = [...base_events, ...runtime_events].filter(
    (event): event is Extract<DomainEvent, { event_type: 'PlayerDied' }> => event.event_type === 'PlayerDied'
  );

  let death_event_index = 0;
  while (death_event_index < player_died_events.length) {
    const death_event = player_died_events[death_event_index] as
      | Extract<DomainEvent, { event_type: 'PlayerDied' }>
      | undefined;
    death_event_index += 1;
    if (!death_event) {
      continue;
    }

    const plugin_ids = collect_present_character_plugin_ids(runtime_state);
    if (plugin_ids.length === 0) {
      continue;
    }

    const dispatch = dispatch_hook(plugin_registry, 'on_player_died', plugin_ids, {
      state: runtime_state,
      player_id: death_event.payload.player_id,
      day_number: death_event.payload.day_number,
      night_number: death_event.payload.night_number,
      reason: death_event.payload.reason
    });

    if (!dispatch.ok) {
      return as_dispatch_error(dispatch.error.code, dispatch.error.message);
    }

    const normalized = normalize_dispatch_output(
      dispatch.value.output,
      `${command.command_id}:PlayerDied:${death_event_index}`,
      created_at,
      command.actor_id
    );

    const settled_execution_deaths = build_execution_death_events(
      runtime_state,
      normalized,
      `${command.command_id}:PlayerDied:${death_event_index}:ExecutionSettled`,
      created_at,
      command.actor_id
    );

    const combined = [...normalized, ...settled_execution_deaths];
    if (combined.length === 0) {
      continue;
    }

    const prompt_id_check = validate_queued_prompt_ids(runtime_state, combined);
    if (!prompt_id_check.ok) {
      return prompt_id_check;
    }

    runtime_events.push(...combined);
    const state_before_compat = runtime_state;
    runtime_state = apply_events(runtime_state, combined);

    const compatibility_events = build_marker_compatibility_events(
      state_before_compat,
      runtime_state,
      combined,
      `${command.command_id}:PlayerDied:${death_event_index}:Compat`,
      created_at,
      command.actor_id
    );
    if (compatibility_events.length > 0) {
      runtime_events.push(...compatibility_events);
      runtime_state = apply_events(runtime_state, compatibility_events);
    }

    for (const event of combined) {
      if (event.event_type === 'PlayerDied') {
        player_died_events.push(event);
      }
    }
  }

  return {
    ok: true,
    value: [...base_events, ...runtime_events]
  };
}

function parse_claimed_ability_prompt(
  state: GameState,
  command: ResolvePromptCommand
): ParsedClaimedAbilityPrompt | null {
  const prompt = state.prompts_by_id[resolve_prompt_key(command)];
  if (!prompt) {
    return null;
  }

  const match = /^plugin:([a-z0-9_-]+):claimed_ability:(d\d+|n\d+):([a-z0-9_-]+)(?::[a-z0-9_-]+)?$/.exec(prompt.reason);
  if (!match) {
    return null;
  }

  return {
    claimed_character_id: match[1] ?? '',
    claimant_player_id: match[3] ?? ''
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
      event_key: `${event_id_prefix}:EmittedEvent:${index}`,
      event_id: 1,
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
      event_key: `${event_id_prefix}:PromptQueued:${index}`,
      event_id: 1,
      event_type: 'PromptQueued',
      created_at,
      ...(fallback_actor_id === undefined ? {} : { actor_id: fallback_actor_id }),
      payload: {
        prompt_key: item.prompt_key,
        prompt_id: item.prompt_id,
        kind: item.kind,
        reason: item.reason,
        visibility: item.visibility,
        options: item.options.map((option) => ({ ...option })),
        selection_mode: item.selection_mode ?? 'single_choice',
        number_range: item.number_range ? { ...item.number_range } : null,
        multi_columns: item.multi_columns
          ? item.multi_columns.map((column) => (Array.isArray(column) ? [...column] : { ...column }))
          : null,
        storyteller_hint: item.storyteller_hint ?? null
      }
    });
  }

  for (const [index, item] of output.queued_interrupts.entries()) {
    normalized.push({
      event_key: `${event_id_prefix}:InterruptScheduled:${index}`,
      event_id: 1,
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

function build_execution_death_events(
  state: GameState,
  source_events: DomainEvent[],
  event_id_prefix: string,
  created_at: string,
  fallback_actor_id?: string
): DomainEvent[] {
  const already_dead_by_source = new Set<string>();
  for (const event of source_events) {
    if (event.event_type !== 'PlayerDied') {
      continue;
    }
    if (event.payload.reason !== 'execution') {
      continue;
    }
    already_dead_by_source.add(event.payload.player_id);
  }

  const settled: DomainEvent[] = [];
  let index = 0;
  for (const event of source_events) {
    if (event.event_type !== 'PlayerExecuted') {
      continue;
    }

    const executed_player_id = event.payload.player_id;
    if (already_dead_by_source.has(executed_player_id)) {
      continue;
    }

    const player = state.players_by_id[executed_player_id];
    if (!player || !player.alive) {
      continue;
    }

    settled.push({
      event_key: `${event_id_prefix}:${index}`,
      event_id: 1,
      event_type: 'PlayerDied',
      created_at,
      ...(fallback_actor_id === undefined ? {} : { actor_id: fallback_actor_id }),
      payload: {
        player_id: executed_player_id,
        day_number: state.day_number,
        night_number: state.night_number,
        reason: 'execution'
      }
    });
    index += 1;
  }

  return settled;
}

function active_marker_count_for_effect(
  state: GameState,
  player_id: string,
  effect: 'poisoned' | 'drunk'
): number {
  let count = 0;
  for (const marker_id of state.active_reminder_marker_ids) {
    const marker = state.reminder_markers_by_id[marker_id];
    if (!marker || marker.status !== 'active' || !marker.authoritative) {
      continue;
    }
    if (marker.target_player_id !== player_id || marker.effect !== effect) {
      continue;
    }
    count += 1;
  }
  return count;
}

function build_marker_compatibility_events(
  before_state: GameState,
  after_state: GameState,
  source_events: DomainEvent[],
  event_id_prefix: string,
  created_at: string,
  fallback_actor_id?: string
): DomainEvent[] {
  const affected_players = new Map<string, Set<'poisoned' | 'drunk'>>();

  for (const event of source_events) {
    if (event.event_type === 'ReminderMarkerApplied') {
      if (!event.payload.authoritative || !event.payload.target_player_id) {
        continue;
      }
      if (event.payload.effect !== 'poisoned' && event.payload.effect !== 'drunk') {
        continue;
      }
      if (!affected_players.has(event.payload.target_player_id)) {
        affected_players.set(event.payload.target_player_id, new Set());
      }
      affected_players.get(event.payload.target_player_id)?.add(event.payload.effect);
      continue;
    }

    if (event.event_type === 'ReminderMarkerCleared' || event.event_type === 'ReminderMarkerExpired') {
      const marker = before_state.reminder_markers_by_id[event.payload.marker_id];
      if (!marker || !marker.authoritative || !marker.target_player_id) {
        continue;
      }
      if (marker.effect !== 'poisoned' && marker.effect !== 'drunk') {
        continue;
      }
      if (!affected_players.has(marker.target_player_id)) {
        affected_players.set(marker.target_player_id, new Set());
      }
      affected_players.get(marker.target_player_id)?.add(marker.effect);
    }
  }

  const events: DomainEvent[] = [];
  let index = 0;
  for (const [player_id, effects] of affected_players) {
    for (const effect of effects) {
      const before_active = active_marker_count_for_effect(before_state, player_id, effect) > 0;
      const after_active = active_marker_count_for_effect(after_state, player_id, effect) > 0;

      if (!before_active && after_active) {
        if (effect === 'poisoned') {
          events.push({
            event_key: `${event_id_prefix}:PoisonApplied:${index}`,
            event_id: 1,
            event_type: 'PoisonApplied',
            created_at,
            ...(fallback_actor_id === undefined ? {} : { actor_id: fallback_actor_id }),
            payload: {
              player_id,
              source_plugin_id: 'reminder_marker',
              day_number: after_state.day_number,
              night_number: after_state.night_number
            }
          });
        } else {
          events.push({
            event_key: `${event_id_prefix}:DrunkApplied:${index}`,
            event_id: 1,
            event_type: 'DrunkApplied',
            created_at,
            ...(fallback_actor_id === undefined ? {} : { actor_id: fallback_actor_id }),
            payload: {
              player_id,
              source_marker_id: 'multiple',
              day_number: after_state.day_number,
              night_number: after_state.night_number
            }
          });
        }
        index += 1;
        continue;
      }

      if (before_active && !after_active) {
        if (effect === 'poisoned') {
          events.push({
            event_key: `${event_id_prefix}:HealthRestored:${index}`,
            event_id: 1,
            event_type: 'HealthRestored',
            created_at,
            ...(fallback_actor_id === undefined ? {} : { actor_id: fallback_actor_id }),
            payload: {
              player_id,
              source_marker_id: 'multiple',
              day_number: after_state.day_number,
              night_number: after_state.night_number
            }
          });
        } else {
          events.push({
            event_key: `${event_id_prefix}:SobrietyRestored:${index}`,
            event_id: 1,
            event_type: 'SobrietyRestored',
            created_at,
            ...(fallback_actor_id === undefined ? {} : { actor_id: fallback_actor_id }),
            payload: {
              player_id,
              source_marker_id: 'multiple',
              day_number: after_state.day_number,
              night_number: after_state.night_number
            }
          });
        }
        index += 1;
      }
    }
  }

  return events;
}

function resolve_prompt_owner_plugin_id(
  state: GameState,
  command: ResolvePromptCommand
): string | null {
  const prompt = state.prompts_by_id[resolve_prompt_key(command)];
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
      event_key: `${context.command.command_id}:InterruptConsumed:${sink.length}`,
      event_id: 1,
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

    const prompt_key = event.payload.prompt_key;
    if (state.prompts_by_id[prompt_key] || seenPromptIds.has(prompt_key)) {
      return {
        ok: false,
        error: {
          code: 'prompt_id_already_exists',
          message: `prompt already exists: ${prompt_key}`
        }
      };
    }

    seenPromptIds.add(prompt_key);
  }

  return {
    ok: true,
    value: undefined
  };
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
        event_key: `${event_id_prefix}:WakeConsumed:${wake_index}`,
        event_id: 1,
        event_type: 'WakeConsumed',
        created_at: context.created_at,
        ...(context.command.actor_id === undefined ? {} : { actor_id: context.command.actor_id }),
      payload: {
          wake_key: wake_step.wake_key,
          wake_id: wake_step.wake_id
        }
      };
      sink.push(wake_consumed);
      runtime_state = apply_events(runtime_state, [wake_consumed]);
      wake_index += 1;
      continue;
    }

    const dispatch = dispatch_hook(plugin_registry, 'on_night_wake', [wake_step.character_id], {
      state: runtime_state,
      player_id: wake_step.player_id,
      wake_step_id: wake_step.wake_key
    });

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
    const state_before_compat = runtime_state;
    runtime_state = apply_events(runtime_state, normalized);

    const compatibility_events = build_marker_compatibility_events(
      state_before_compat,
      runtime_state,
      normalized,
      `${event_id_prefix}:${wake_index}:Compat`,
      context.created_at,
      context.command.actor_id
    );
    if (compatibility_events.length > 0) {
      sink.push(...compatibility_events);
      runtime_state = apply_events(runtime_state, compatibility_events);
    }

    const wake_consumed: DomainEvent = {
      event_key: `${event_id_prefix}:WakeConsumed:${wake_index}`,
      event_id: 1,
      event_type: 'WakeConsumed',
      created_at: context.created_at,
      ...(context.command.actor_id === undefined ? {} : { actor_id: context.command.actor_id }),
      payload: {
        wake_key: wake_step.wake_key,
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

function collect_present_character_plugin_ids(state: GameState): string[] {
  const ids = new Set<string>();
  for (const player of Object.values(state.players_by_id)) {
    if (!player || !player.true_character_id) {
      continue;
    }
    ids.add(player.true_character_id);
  }
  return [...ids];
}
