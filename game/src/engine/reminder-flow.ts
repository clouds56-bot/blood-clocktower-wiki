import type {
  ApplyDrunkCommand,
  ApplyPoisonCommand,
  ApplyReminderMarkerCommand,
  ClearReminderMarkerCommand,
  ClearReminderMarkersBySelectorCommand,
  SweepReminderExpiryCommand
} from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState, ReminderEffect, ReminderExpiryPolicy, ReminderMarkerState } from '../domain/types.js';
import type { EngineResult } from './phase-machine.js';

function error(code: string, message: string): EngineResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function active_marker_count_for_effect(
  state: GameState,
  player_id: string,
  effect: ReminderEffect,
  excluded_marker_ids: Set<string> = new Set()
): number {
  let count = 0;
  for (const marker_id of state.active_reminder_marker_ids) {
    if (excluded_marker_ids.has(marker_id)) {
      continue;
    }
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

function marker_matches_selector(
  marker: ReminderMarkerState,
  command: ClearReminderMarkersBySelectorCommand
): boolean {
  if (marker.status !== 'active') {
    return false;
  }
  if (command.payload.kind !== null && marker.kind !== command.payload.kind) {
    return false;
  }
  if (command.payload.effect !== null && marker.effect !== command.payload.effect) {
    return false;
  }
  if (
    command.payload.source_player_id !== null &&
    marker.source_player_id !== command.payload.source_player_id
  ) {
    return false;
  }
  if (
    command.payload.source_character_id !== null &&
    marker.source_character_id !== command.payload.source_character_id
  ) {
    return false;
  }
  if (
    command.payload.target_player_id !== null &&
    marker.target_player_id !== command.payload.target_player_id
  ) {
    return false;
  }
  return true;
}

function should_expire_marker(marker: ReminderMarkerState, command: SweepReminderExpiryCommand): boolean {
  const { phase, subphase, day_number, night_number } = command.payload;
  const is_day = phase === 'day';
  const is_night = phase === 'night' || phase === 'first_night';

  if (marker.status !== 'active') {
    return false;
  }

  switch (marker.expires_policy as ReminderExpiryPolicy) {
    case 'manual':
      return false;
    case 'start_of_day':
      return is_day && subphase === 'open_discussion';
    case 'end_of_day':
      return is_day && subphase === 'day_end';
    case 'start_of_night':
      return is_night && subphase === 'dusk';
    case 'end_of_night':
      return is_night && subphase === 'dawn';
    case 'at_day':
      return marker.expires_at_day_number !== null && marker.expires_at_day_number <= day_number;
    case 'at_night':
      return marker.expires_at_night_number !== null && marker.expires_at_night_number <= night_number;
    case 'on_source_death':
    case 'on_target_death':
      return false;
    default:
      return false;
  }
}

function build_restored_events(
  state: GameState,
  command_id: string,
  created_at: string,
  actor_id: string | undefined,
  removed_marker_ids: Set<string>
): DomainEvent[] {
  const events: DomainEvent[] = [];
  const affected = new Map<string, Set<ReminderEffect>>();

  for (const marker_id of removed_marker_ids) {
    const marker = state.reminder_markers_by_id[marker_id];
    if (!marker || !marker.target_player_id || !marker.authoritative) {
      continue;
    }
    if (marker.effect !== 'poisoned' && marker.effect !== 'drunk') {
      continue;
    }
    if (!affected.has(marker.target_player_id)) {
      affected.set(marker.target_player_id, new Set());
    }
    affected.get(marker.target_player_id)?.add(marker.effect);
  }

  let index = 0;
  for (const [target_player_id, effects] of affected) {
    for (const effect of effects) {
      const before = active_marker_count_for_effect(state, target_player_id, effect) > 0;
      const after = active_marker_count_for_effect(state, target_player_id, effect, removed_marker_ids) > 0;
      if (!before || after) {
        continue;
      }
      if (effect === 'poisoned') {
        events.push({
          event_id: `${command_id}:HealthRestored:${index}`,
          event_type: 'HealthRestored',
          created_at,
          ...(actor_id === undefined ? {} : { actor_id }),
          payload: {
            player_id: target_player_id,
            source_marker_id: 'multiple',
            day_number: state.day_number,
            night_number: state.night_number
          }
        });
      } else if (effect === 'drunk') {
        events.push({
          event_id: `${command_id}:SobrietyRestored:${index}`,
          event_type: 'SobrietyRestored',
          created_at,
          ...(actor_id === undefined ? {} : { actor_id }),
          payload: {
            player_id: target_player_id,
            source_marker_id: 'multiple',
            day_number: state.day_number,
            night_number: state.night_number
          }
        });
      }
      index += 1;
    }
  }

  return events;
}

export function handle_apply_reminder_marker(
  state: GameState,
  command: ApplyReminderMarkerCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  if (state.reminder_markers_by_id[command.payload.marker_id]) {
    return error('marker_id_already_exists', `marker already exists: ${command.payload.marker_id}`);
  }

  const events: DomainEvent[] = [
    {
      event_id: `${command.command_id}:ReminderMarkerApplied:0`,
      event_type: 'ReminderMarkerApplied',
      created_at,
      actor_id: command.actor_id,
      payload: {
        ...command.payload,
        note: command.payload.note ?? ''
      }
    }
  ];

  const target_player_id = command.payload.target_player_id;
  if (target_player_id && command.payload.authoritative) {
    if (command.payload.effect === 'poisoned' && active_marker_count_for_effect(state, target_player_id, 'poisoned') === 0) {
      events.push({
        event_id: `${command.command_id}:PoisonApplied:0`,
        event_type: 'PoisonApplied',
        created_at,
        ...(command.actor_id === undefined ? {} : { actor_id: command.actor_id }),
        payload: {
          player_id: target_player_id,
          source_plugin_id: command.payload.source_character_id ?? 'reminder_marker',
          day_number: state.day_number,
          night_number: state.night_number
        }
      });
    }
    if (command.payload.effect === 'drunk' && active_marker_count_for_effect(state, target_player_id, 'drunk') === 0) {
      events.push({
        event_id: `${command.command_id}:DrunkApplied:0`,
        event_type: 'DrunkApplied',
        created_at,
        ...(command.actor_id === undefined ? {} : { actor_id: command.actor_id }),
        payload: {
          player_id: target_player_id,
          source_marker_id: command.payload.marker_id,
          day_number: state.day_number,
          night_number: state.night_number
        }
      });
    }
  }

  return {
    ok: true,
    value: events
  };
}

export function handle_clear_reminder_marker(
  state: GameState,
  command: ClearReminderMarkerCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const marker = state.reminder_markers_by_id[command.payload.marker_id];
  if (!marker) {
    return error('marker_not_found', `marker not found: ${command.payload.marker_id}`);
  }
  if (marker.status !== 'active') {
    return error('marker_not_active', `marker is not active: ${command.payload.marker_id}`);
  }

  const removed_marker_ids = new Set<string>([command.payload.marker_id]);
  const events: DomainEvent[] = [
    {
      event_id: `${command.command_id}:ReminderMarkerCleared:0`,
      event_type: 'ReminderMarkerCleared',
      created_at,
      actor_id: command.actor_id,
      payload: {
        marker_id: command.payload.marker_id,
        reason: command.payload.reason
      }
    },
    ...build_restored_events(state, command.command_id, created_at, command.actor_id, removed_marker_ids)
  ];

  return {
    ok: true,
    value: events
  };
}

export function handle_clear_reminder_markers_by_selector(
  state: GameState,
  command: ClearReminderMarkersBySelectorCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const marker_ids = state.active_reminder_marker_ids.filter((marker_id) => {
    const marker = state.reminder_markers_by_id[marker_id];
    return Boolean(marker && marker_matches_selector(marker, command));
  });

  if (marker_ids.length === 0) {
    return {
      ok: true,
      value: []
    };
  }

  const removed_marker_ids = new Set<string>(marker_ids);
  const events: DomainEvent[] = marker_ids.map((marker_id, index) => ({
    event_id: `${command.command_id}:ReminderMarkerCleared:${index}`,
    event_type: 'ReminderMarkerCleared',
    created_at,
    actor_id: command.actor_id,
    payload: {
      marker_id,
      reason: command.payload.reason
    }
  }));

  events.push(...build_restored_events(state, command.command_id, created_at, command.actor_id, removed_marker_ids));

  return {
    ok: true,
    value: events
  };
}

export function handle_sweep_reminder_expiry(
  state: GameState,
  command: SweepReminderExpiryCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const expired_marker_ids = state.active_reminder_marker_ids.filter((marker_id) => {
    const marker = state.reminder_markers_by_id[marker_id];
    return Boolean(marker && should_expire_marker(marker, command));
  });

  if (expired_marker_ids.length === 0) {
    return {
      ok: true,
      value: []
    };
  }

  const removed_marker_ids = new Set<string>(expired_marker_ids);
  const events: DomainEvent[] = expired_marker_ids.map((marker_id, index) => ({
    event_id: `${command.command_id}:ReminderMarkerExpired:${index}`,
    event_type: 'ReminderMarkerExpired',
    created_at,
    actor_id: command.actor_id,
    payload: {
      marker_id,
      reason: 'expiry_policy_match'
    }
  }));

  events.push(...build_restored_events(state, command.command_id, created_at, command.actor_id, removed_marker_ids));

  return {
    ok: true,
    value: events
  };
}

export function handle_apply_poison(
  state: GameState,
  command: ApplyPoisonCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const marker_result = handle_apply_reminder_marker(
    state,
    {
      ...command,
      command_type: 'ApplyReminderMarker',
      payload: {
        marker_id: command.payload.marker_id,
        kind: command.payload.kind,
        effect: 'poisoned',
        note: command.payload.note ?? `poison applied by ${command.payload.source_character_id}`,
        source_player_id: command.payload.source_player_id,
        source_character_id: command.payload.source_character_id,
        target_player_id: command.payload.target_player_id,
        target_scope: 'player',
        authoritative: true,
        expires_policy: 'manual',
        expires_at_day_number: null,
        expires_at_night_number: null,
        source_event_id: null,
        metadata: {
          compatibility_command: 'ApplyPoison',
          day_number: command.payload.day_number,
          night_number: command.payload.night_number
        }
      }
    },
    created_at
  );

  if (!marker_result.ok) {
    return marker_result;
  }

  return {
    ok: true,
    value: marker_result.value
  };
}

export function handle_apply_drunk(
  state: GameState,
  command: ApplyDrunkCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const marker_result = handle_apply_reminder_marker(
    state,
    {
      ...command,
      command_type: 'ApplyReminderMarker',
      payload: {
        marker_id: command.payload.marker_id,
        kind: command.payload.kind,
        effect: 'drunk',
        note: command.payload.note ?? `drunk applied by ${command.payload.source_character_id}`,
        source_player_id: command.payload.source_player_id,
        source_character_id: command.payload.source_character_id,
        target_player_id: command.payload.target_player_id,
        target_scope: 'player',
        authoritative: true,
        expires_policy: 'manual',
        expires_at_day_number: null,
        expires_at_night_number: null,
        source_event_id: null,
        metadata: {
          compatibility_command: 'ApplyDrunk',
          day_number: command.payload.day_number,
          night_number: command.payload.night_number
        }
      }
    },
    created_at
  );

  if (!marker_result.ok) {
    return marker_result;
  }

  return {
    ok: true,
    value: marker_result.value
  };
}
