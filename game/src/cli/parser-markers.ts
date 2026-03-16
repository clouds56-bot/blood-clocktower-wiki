import type { GameState } from '../domain/types.js';
import { invalid, type ParsedCliLine } from './parser-common.js';
import { CLI_USAGE } from './command-registry.js';

export function parse_marker_domain_command(
  command: string,
  args: string[],
  state?: GameState
): ParsedCliLine | null {
  if (command === 'markers' || command === 'reminders') {
    return { ok: true, kind: 'local', action: { type: 'markers' } };
  }

  if (command === 'marker' || command === 'reminder') {
    const marker_id = args[0];
    if (!marker_id) {
      return invalid(`usage: ${CLI_USAGE.marker}`);
    }
    return { ok: true, kind: 'local', action: { type: 'marker', marker_id } };
  }

  if (command === 'apply-marker' || command === 'apply-reminder') {
    const marker_id = args[0];
    const kind = args[1];
    const effect = args[2];
    const target_player_id = args[3] ?? null;
    const source_character_id = args[4] ?? null;
    const note = args.slice(5).join(' ').trim() || `${kind ?? 'marker'}:${effect ?? 'effect'}`;
    if (!marker_id || !kind || !effect) {
      return invalid(`usage: ${CLI_USAGE.apply_marker}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'ApplyReminderMarker',
        payload: {
          marker_id,
          kind,
          effect,
          note,
          source_player_id: null,
          source_character_id,
          target_player_id,
          target_scope: target_player_id ? 'player' : 'game',
          authoritative: true,
          expires_policy: 'manual',
          expires_at_day_number: null,
          expires_at_night_number: null,
          source_event_id: null,
          metadata: {}
        }
      }
    };
  }

  if (command === 'clear-marker' || command === 'clear-reminder') {
    const marker_id = args[0];
    const reason = args.slice(1).join(' ').trim() || 'manual_clear';
    if (!marker_id) {
      return invalid(`usage: ${CLI_USAGE.clear_marker}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'ClearReminderMarker',
        payload: {
          marker_id,
          reason
        }
      }
    };
  }

  if (command === 'sweep-markers' || command === 'sweep-reminders') {
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'SweepReminderExpiry',
        payload: {
          phase: state?.phase ?? 'setup',
          subphase: state?.subphase ?? 'idle',
          day_number: state?.day_number ?? 0,
          night_number: state?.night_number ?? 0
        }
      }
    };
  }

  return null;
}
