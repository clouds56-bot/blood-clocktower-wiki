import { Text } from 'ink';

import type { DomainEvent } from '../domain/events.js';

function as_record(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

function compact_json(value: unknown, max_len: number): string {
  const raw = JSON.stringify(value);
  if (!raw) {
    return '{}';
  }
  return clip_single_line(raw, max_len);
}

function clip_single_line(text: string, max_len: number): string {
  const single = text.replace(/\s+/g, ' ').trim();
  if (single.length <= max_len) {
    return single;
  }
  return `${single.slice(0, Math.max(0, max_len - 1))}~`;
}

function string_value(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

function number_value(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' ? value : null;
}

function bool_value(payload: Record<string, unknown>, key: string): boolean | null {
  const value = payload[key];
  return typeof value === 'boolean' ? value : null;
}

function note_value(payload: Record<string, unknown>): string | null {
  const note = string_value(payload, 'note');
  if (note && note.length > 0) {
    return note;
  }
  const notes = string_value(payload, 'notes');
  if (notes && notes.length > 0) {
    return notes;
  }
  const freeform = string_value(payload, 'freeform');
  if (freeform && freeform.length > 0) {
    return freeform;
  }
  return null;
}

function quote_note(note: string | null, max_len: number): string {
  if (!note) {
    return '';
  }
  return `<${clip_single_line(note, max_len)}>`;
}

function event_tail(event: DomainEvent, payload_max_len: number): string {
  const payload = as_record(event.payload);

  switch (event.event_type) {
    case 'GameCreated': {
      return string_value(payload, 'game_id') ?? compact_json(payload, payload_max_len);
    }
    case 'ScriptSelected': {
      return string_value(payload, 'script_id') ?? compact_json(payload, payload_max_len);
    }
    case 'EditionSelected': {
      return string_value(payload, 'edition_id') ?? compact_json(payload, payload_max_len);
    }
    case 'PlayerAdded': {
      return `${string_value(payload, 'player_id') ?? '?'} ${string_value(payload, 'display_name') ?? '?'}`;
    }
    case 'SeatOrderSet': {
      const seat_order = payload.seat_order;
      const count = Array.isArray(seat_order) ? seat_order.length : 0;
      return `seats=${count}`;
    }
    case 'CharacterAssigned': {
      return `${string_value(payload, 'player_id') ?? '?'} ${string_value(payload, 'true_character_id') ?? '?'}`;
    }
    case 'PerceivedCharacterAssigned': {
      return `${string_value(payload, 'player_id') ?? '?'} ${string_value(payload, 'perceived_character_id') ?? '?'}`;
    }
    case 'AlignmentAssigned': {
      return `${string_value(payload, 'player_id') ?? '?'} ${string_value(payload, 'true_alignment') ?? '?'}`;
    }
    case 'PhaseAdvanced': {
      return `${string_value(payload, 'phase') ?? '?'} ${string_value(payload, 'subphase') ?? '?'} d${number_value(payload, 'day_number') ?? 0} n${number_value(payload, 'night_number') ?? 0}`;
    }
    case 'NominationWindowOpened': {
      return `d${number_value(payload, 'day_number') ?? 0}`;
    }
    case 'NominationMade': {
      return `${string_value(payload, 'nominator_player_id') ?? '?'}->${string_value(payload, 'nominee_player_id') ?? '?'} ${string_value(payload, 'nomination_id') ?? '?'}`;
    }
    case 'VoteOpened': {
      return `${string_value(payload, 'nomination_id') ?? '?'} ${string_value(payload, 'nominee_player_id') ?? '?'}`;
    }
    case 'VoteCast': {
      const vote = bool_value(payload, 'in_favor');
      return `${string_value(payload, 'voter_player_id') ?? '?'} ${vote === null ? '?' : vote ? 'yes' : 'no'}`;
    }
    case 'VoteClosed': {
      return `${string_value(payload, 'nomination_id') ?? '?'} ${number_value(payload, 'vote_total') ?? 0}/${number_value(payload, 'threshold') ?? 0}`;
    }
    case 'ExecutionResolutionCompleted': {
      return `d${number_value(payload, 'day_number') ?? 0} had_execution=${bool_value(payload, 'had_execution') ?? false}`;
    }
    case 'ExecutionOccurred': {
      return `${string_value(payload, 'player_id') ?? '?'} d${number_value(payload, 'day_number') ?? 0}`;
    }
    case 'PlayerExecuted': {
      return `${string_value(payload, 'player_id') ?? '?'} d${number_value(payload, 'day_number') ?? 0}`;
    }
    case 'PlayerSurvivedExecution': {
      return `${string_value(payload, 'player_id') ?? '?'} d${number_value(payload, 'day_number') ?? 0}`;
    }
    case 'ClaimedAbilityAttempted': {
      return `${string_value(payload, 'claimant_player_id') ?? '?'} ${string_value(payload, 'claimed_character_id') ?? '?'}`;
    }
    case 'ExecutionConsequencesResolved': {
      return `d${number_value(payload, 'day_number') ?? 0}`;
    }
    case 'PlayerDied': {
      return `${string_value(payload, 'player_id') ?? '?'} ${string_value(payload, 'reason') ?? '?'}`;
    }
    case 'ReminderMarkerApplied': {
      return `${string_value(payload, 'marker_id') ?? '?'} ${string_value(payload, 'kind') ?? '?'} ${string_value(payload, 'target_player_id') ?? '-'}`;
    }
    case 'ReminderMarkerCleared': {
      const marker_id = string_value(payload, 'marker_id') ?? '?';
      const reason = string_value(payload, 'reason') ?? '';
      return reason ? `${marker_id} ${reason}` : marker_id;
    }
    case 'ReminderMarkerExpired': {
      return string_value(payload, 'marker_id') ?? compact_json(payload, payload_max_len);
    }
    case 'DrunkApplied':
    case 'SobrietyRestored':
    case 'HealthRestored':
    case 'PoisonApplied':
    case 'PoisonCleared': {
      return string_value(payload, 'player_id') ?? compact_json(payload, payload_max_len);
    }
    case 'DeadVoteConsumed': {
      return `${string_value(payload, 'player_id') ?? '?'} d${number_value(payload, 'day_number') ?? 0}`;
    }
    case 'WakeScheduled': {
      return `${string_value(payload, 'player_id') ?? '?'} ${string_value(payload, 'character_id') ?? '?'}`;
    }
    case 'WakeConsumed': {
      return string_value(payload, 'wake_key') ?? compact_json(payload, payload_max_len);
    }
    case 'InterruptScheduled': {
      return `${string_value(payload, 'kind') ?? '?'} ${string_value(payload, 'source_plugin_id') ?? '?'}`;
    }
    case 'InterruptConsumed': {
      return string_value(payload, 'interrupt_id') ?? compact_json(payload, payload_max_len);
    }
    case 'PromptQueued': {
      const kind = string_value(payload, 'kind') ?? '?';
      const prompt_key = string_value(payload, 'prompt_key') ?? '?';
      return `${kind} pk=${prompt_key}`;
    }
    case 'PromptResolved': {
      const selected = string_value(payload, 'selected_option_id') ?? '-';
      const note = quote_note(note_value(payload), Math.floor(payload_max_len / 2));
      const prompt_key = string_value(payload, 'prompt_key') ?? '?';
      return note ? `${selected} ${note} pk=${prompt_key}` : `${selected} pk=${prompt_key}`;
    }
    case 'PromptCancelled': {
      const reason = quote_note(string_value(payload, 'reason'), Math.floor(payload_max_len / 2));
      const prompt_key = string_value(payload, 'prompt_key') ?? '?';
      return reason ? `${reason} pk=${prompt_key}` : `pk=${prompt_key}`;
    }
    case 'RegistrationQueryCreated': {
      return `${string_value(payload, 'query_id') ?? '?'} ${string_value(payload, 'consumer_role_id') ?? '?'} ${string_value(payload, 'subject_player_id') ?? '?'}`;
    }
    case 'RegistrationDecisionRecorded': {
      const query_id = string_value(payload, 'query_id') ?? '?';
      const result =
        string_value(payload, 'resolved_character_id') ??
        string_value(payload, 'resolved_alignment') ??
        string_value(payload, 'resolved_character_type') ??
        'none';
      const note = quote_note(note_value(payload), Math.floor(payload_max_len / 2));
      return note ? `${query_id} ${result} ${note}` : `${query_id} ${result}`;
    }
    case 'StorytellerChoiceMade': {
      const selected = string_value(payload, 'selected_option_id') ?? '-';
      const note = quote_note(note_value(payload), Math.floor(payload_max_len / 2));
      const prompt_key = string_value(payload, 'prompt_key') ?? '?';
      return note ? `${selected} ${note} pk=${prompt_key}` : `${selected} pk=${prompt_key}`;
    }
    case 'StorytellerRulingRecorded': {
      const note = quote_note(note_value(payload), payload_max_len);
      const prompt_key = string_value(payload, 'prompt_key');
      if (prompt_key && prompt_key.length > 0) {
        return note ? `${note} pk=${prompt_key}` : `pk=${prompt_key}`;
      }
      return note || '<note>';
    }
    case 'WinCheckCompleted': {
      return `d${number_value(payload, 'day_number') ?? 0} n${number_value(payload, 'night_number') ?? 0} winner=${bool_value(payload, 'winner_found') ?? false}`;
    }
    case 'GameWon': {
      return string_value(payload, 'winning_team') ?? compact_json(payload, payload_max_len);
    }
    case 'ForcedVictoryDeclared': {
      const team = string_value(payload, 'winning_team') ?? '?';
      const rationale = quote_note(string_value(payload, 'rationale'), Math.floor(payload_max_len / 2));
      return rationale ? `${team} ${rationale}` : team;
    }
    case 'GameEnded': {
      return `${string_value(payload, 'winning_team') ?? '?'} ${string_value(payload, 'end_reason') ?? '?'}`;
    }
    default: {
      return compact_json(payload, payload_max_len);
    }
  }
}

interface EventStyle {
  color: string;
  bold?: boolean;
}

export function event_style_for_tui(event_type: DomainEvent['event_type']): EventStyle {
  if (
    event_type === 'GameCreated' ||
    event_type === 'ScriptSelected' ||
    event_type === 'EditionSelected' ||
    event_type === 'PlayerAdded' ||
    event_type === 'SeatOrderSet' ||
    event_type === 'CharacterAssigned' ||
    event_type === 'PerceivedCharacterAssigned' ||
    event_type === 'AlignmentAssigned'
  ) {
    return { color: 'gray' };
  }
  if (event_type === 'GameEnded' || event_type === 'GameWon' || event_type === 'ForcedVictoryDeclared') {
    return { color: 'magenta', bold: true };
  }
  if (
    event_type === 'PlayerDied' ||
    event_type === 'PlayerExecuted' ||
    event_type === 'ExecutionOccurred' ||
    event_type === 'ExecutionConsequencesResolved'
  ) {
    return { color: 'red' };
  }
  if (event_type === 'PhaseAdvanced' || event_type === 'NominationWindowOpened') {
    return { color: 'blue', bold: true };
  }
  if (event_type === 'WakeScheduled' || event_type === 'WakeConsumed') {
    return { color: 'gray' };
  }
  if (event_type === 'PromptQueued') {
    return { color: 'yellow', bold: true };
  }
  if (event_type === 'PromptResolved' || event_type === 'PromptCancelled') {
    return { color: 'yellow' };
  }
  if (event_type === 'StorytellerChoiceMade' || event_type === 'StorytellerRulingRecorded') {
    return { color: 'white', bold: true };
  }
  if (
    event_type === 'ReminderMarkerApplied' ||
    event_type === 'ReminderMarkerCleared' ||
    event_type === 'ReminderMarkerExpired'
  ) {
    return { color: 'magenta', bold: true };
  }
  if (
    event_type === 'DrunkApplied' ||
    event_type === 'SobrietyRestored' ||
    event_type === 'HealthRestored' ||
    event_type === 'PoisonApplied' ||
    event_type === 'PoisonCleared'
  ) {
    return { color: 'magenta' };
  }
  if (
    event_type === 'NominationMade' ||
    event_type === 'VoteOpened' ||
    event_type === 'VoteCast' ||
    event_type === 'VoteClosed'
  ) {
    return { color: 'white' };
  }
  if (
    event_type === 'WinCheckCompleted' ||
    event_type === 'ExecutionResolutionCompleted' ||
    event_type === 'InterruptScheduled' ||
    event_type === 'InterruptConsumed' ||
    event_type === 'RegistrationQueryCreated' ||
    event_type === 'RegistrationDecisionRecorded'
  ) {
    return { color: 'cyan' };
  }
  return { color: 'white' };
}

export function format_event_summary_text(event: DomainEvent, event_index: number, payload_max_len = 64): string {
  const tail = clip_single_line(event_tail(event, payload_max_len), payload_max_len);
  return tail.length > 0
    ? `#${event_index} ${event.event_type} ${tail}`
    : `#${event_index} ${event.event_type}`;
}

export function EventSummaryRow(props: {
  event: DomainEvent;
  event_index: number;
  selected: boolean;
  width: number;
}): JSX.Element {
  const { event, event_index, selected, width } = props;
  const prefix = selected ? '> ' : '  ';
  const content_width = Math.max(8, width - prefix.length);
  const line = format_event_summary_text(event, event_index, Math.max(24, content_width - 18));
  const clipped = line.length > content_width ? `${line.slice(0, Math.max(0, content_width - 1))}~` : line;
  const style = event_style_for_tui(event.event_type);
  if (selected) {
    return (
      <Text color={style.color} backgroundColor="white" bold wrap="truncate-end">
        {`${prefix}${clipped}`}
      </Text>
    );
  }

  return (
    <Text color={style.color} bold={Boolean(style.bold)} wrap="truncate-end">
      {`${prefix}${clipped}`}
    </Text>
  );
}
