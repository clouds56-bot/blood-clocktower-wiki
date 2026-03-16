import type { Command } from '../domain/commands.js';
import type {
  Alignment,
  GamePhase,
  GameState,
  GameSubphase,
  NominationRecord,
  PromptVisibility
} from '../domain/types.js';

export type CliLocalAction =
  | { type: 'help'; topic?: 'phase' | 'all' }
  | { type: 'next_phase'; scope: 'subphase' | 'phase' | 'day' | 'night'; auto_prompt: boolean }
  | { type: 'bulk_vote'; nomination_id: string; voter_player_ids: string[]; in_favor: boolean }
  | { type: 'state'; format: 'brief' | 'json' }
  | { type: 'events'; count: number }
  | { type: 'players' }
  | { type: 'player'; player_id: string }
  | { type: 'view_storyteller'; json: boolean }
  | { type: 'view_public'; json: boolean }
  | { type: 'view_player'; player_id: string; json: boolean }
  | { type: 'prompts' }
  | { type: 'prompt'; prompt_id: string }
  | { type: 'markers' }
  | { type: 'marker'; marker_id: string }
  | {
      type: 'setup_player';
      player_id: string;
      true_character_id: string;
      perceived_character_id: string;
      character_type: CharacterSetupType;
      alignment: Alignment | null;
    }
  | { type: 'new_game'; game_id: string }
  | { type: 'quick_setup'; script: string; player_num: number; game_id?: string }
  | { type: 'quit' };

export type ParsedCliLine =
  | { ok: true; kind: 'empty' }
  | { ok: true; kind: 'local'; action: CliLocalAction }
  | { ok: true; kind: 'engine'; command: Omit<Command, 'command_id'> }
  | { ok: false; message: string };

export type DeathReason = 'execution' | 'night_death' | 'ability' | 'storyteller';
export type CharacterSetupType = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller';

export function parse_int(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  if (parsed < 0) {
    return null;
  }
  return parsed;
}

export function parse_alignment(value: string): Alignment | null {
  if (value === 'good' || value === 'evil') {
    return value;
  }
  return null;
}

export function parse_phase(value: string): GamePhase | null {
  if (
    value === 'setup' ||
    value === 'first_night' ||
    value === 'day' ||
    value === 'night' ||
    value === 'ended'
  ) {
    return value;
  }
  return null;
}

export function parse_subphase(value: string): GameSubphase | null {
  if (
    value === 'open_discussion' ||
    value === 'nomination_window' ||
    value === 'vote_in_progress' ||
    value === 'execution_resolution' ||
    value === 'day_end' ||
    value === 'dusk' ||
    value === 'night_wake_sequence' ||
    value === 'immediate_interrupt_resolution' ||
    value === 'dawn' ||
    value === 'idle' ||
    value === 'complete'
  ) {
    return value;
  }
  return null;
}

export function parse_yes_no(value: string): boolean | null {
  if (value === 'yes' || value === 'y' || value === 'true') {
    return true;
  }
  if (value === 'no' || value === 'n' || value === 'false') {
    return false;
  }
  return null;
}

export function parse_death_reason(value: string): DeathReason | null {
  if (value === 'execution' || value === 'night_death' || value === 'ability' || value === 'storyteller') {
    return value;
  }
  return null;
}

export function parse_prompt_visibility(value: string): PromptVisibility | null {
  if (value === 'storyteller' || value === 'player' || value === 'public') {
    return value;
  }
  return null;
}

export function parse_character_setup_type(value: string): CharacterSetupType | null {
  if (
    value === 'townsfolk' ||
    value === 'outsider' ||
    value === 'minion' ||
    value === 'demon' ||
    value === 'traveller'
  ) {
    return value;
  }
  return null;
}

export function invalid(message: string): ParsedCliLine {
  return {
    ok: false,
    message
  };
}

export function current_day_number(state?: GameState): number | null {
  return state ? state.day_number : null;
}

export function current_night_number(state?: GameState): number | null {
  return state ? state.night_number : null;
}

export function next_nomination_id(state?: GameState): string | null {
  if (!state) {
    return null;
  }
  return `n${state.day_state.nominations_today.length + 1}`;
}

export function latest_nomination(state?: GameState): NominationRecord | null {
  if (!state || state.day_state.nominations_today.length === 0) {
    return null;
  }
  return state.day_state.nominations_today[state.day_state.nominations_today.length - 1] ?? null;
}

export function find_nomination(state: GameState | undefined, nomination_id: string): NominationRecord | null {
  if (!state) {
    return null;
  }
  return state.day_state.nominations_today.find((item) => item.nomination_id === nomination_id) ?? null;
}

export function default_opened_by_player_id(state?: GameState, nomination_id?: string): string | null {
  if (!state) {
    return null;
  }
  if (nomination_id) {
    const nomination = find_nomination(state, nomination_id);
    if (nomination) {
      return nomination.nominator_player_id;
    }
  }
  for (const player_id of state.seat_order) {
    const player = state.players_by_id[player_id];
    if (player?.alive) {
      return player_id;
    }
  }
  const first = Object.keys(state.players_by_id)[0];
  return first ?? null;
}

export function default_executed_player_id(state?: GameState): string | null {
  if (!state) {
    return null;
  }
  return state.day_state.executed_player_id;
}

export function default_pending_prompt_id(state?: GameState): string | null {
  if (!state) {
    return null;
  }
  if (state.pending_prompts.length !== 1) {
    return null;
  }
  return state.pending_prompts[0] ?? null;
}

export function random_option_id_for_prompt(state: GameState | undefined, prompt_id: string): string | null {
  if (!state) {
    return null;
  }
  const prompt = state.prompts_by_id[prompt_id];
  if (!prompt || prompt.status !== 'pending') {
    return null;
  }

  if (prompt.selection_mode === 'number_range' && prompt.number_range) {
    const min = Math.ceil(prompt.number_range.min);
    const raw_max = (prompt.number_range.max_inclusive ?? true)
      ? Math.floor(prompt.number_range.max)
      : Math.ceil(prompt.number_range.max) - 1;
    if (raw_max < min) {
      return null;
    }
    const value = min + Math.floor(Math.random() * (raw_max - min + 1));
    return String(value);
  }

  if (prompt.selection_mode === 'multi_column' && prompt.multi_columns && prompt.multi_columns.length > 0) {
    const picked: string[] = [];
    for (const column of prompt.multi_columns) {
      if (Array.isArray(column)) {
        if (column.length === 0) {
          return null;
        }
        const value = column[Math.floor(Math.random() * column.length)];
        if (!value) {
          return null;
        }
        picked.push(value);
        continue;
      }

      const min = Math.ceil(column.min);
      const raw_max = (column.max_inclusive ?? true) ? Math.floor(column.max) : Math.ceil(column.max) - 1;
      if (raw_max < min) {
        return null;
      }
      const value = min + Math.floor(Math.random() * (raw_max - min + 1));
      picked.push(String(value));
    }
    return picked.join(',');
  }

  if (prompt.options.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * prompt.options.length);
  const option = prompt.options[index];
  return option?.option_id ?? null;
}
