import { create_empty_day_state, type GameState } from './types.js';

export function create_initial_state(game_id: string): GameState {
  return {
    game_id,
    script_id: null,
    edition_id: null,
    status: 'setup',
    phase: 'setup',
    subphase: 'idle',
    day_number: 0,
    night_number: 0,
    players_by_id: {},
    seat_order: [],
    day_state: create_empty_day_state(),
    execution_history: [],
    death_history: [],
    wake_queue: [],
    interrupt_queue: [],
    prompts_by_id: {},
    pending_prompts: [],
    reminder_markers_by_id: {},
    active_reminder_marker_ids: [],
    storyteller_notes: [],
    winning_team: null,
    end_reason: null,
    ended_at_event_id: null,
    domain_events: []
  };
}
