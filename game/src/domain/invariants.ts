import {
  VALID_GAME_PHASE,
  VALID_GAME_STATUS,
  VALID_GAME_SUBPHASE,
  type GameState,
  type InvariantIssue,
  type PlayerState
} from './types.js';

function has_required_player_fields(player: Partial<PlayerState>): boolean {
  return (
    typeof player.player_id === 'string' &&
    typeof player.display_name === 'string' &&
    typeof player.alive === 'boolean' &&
    typeof player.dead_vote_available === 'boolean' &&
    typeof player.drunk === 'boolean' &&
    typeof player.poisoned === 'boolean' &&
    typeof player.is_traveller === 'boolean' &&
    typeof player.is_demon === 'boolean'
  );
}

function is_subphase_valid_for_phase(phase: GameState['phase'], subphase: GameState['subphase']): boolean {
  if (phase === 'setup') {
    return subphase === 'idle';
  }
  if (phase === 'first_night' || phase === 'night') {
    return (
      subphase === 'dusk' ||
      subphase === 'night_wake_sequence' ||
      subphase === 'immediate_interrupt_resolution' ||
      subphase === 'dawn'
    );
  }
  if (phase === 'day') {
    return (
      subphase === 'open_discussion' ||
      subphase === 'nomination_window' ||
      subphase === 'vote_in_progress' ||
      subphase === 'execution_resolution' ||
      subphase === 'day_end'
    );
  }
  return phase === 'ended' && subphase === 'complete';
}

export function validate_invariants(state: GameState): InvariantIssue[] {
  const issues: InvariantIssue[] = [];

  if (!Number.isInteger(state.day_number) || state.day_number < 0) {
    issues.push({
      code: 'invalid_day_number',
      message: 'day_number must be an integer >= 0',
      path: 'day_number',
      severity: 'error'
    });
  }

  if (!Number.isInteger(state.night_number) || state.night_number < 0) {
    issues.push({
      code: 'invalid_night_number',
      message: 'night_number must be an integer >= 0',
      path: 'night_number',
      severity: 'error'
    });
  }

  if (!VALID_GAME_STATUS.includes(state.status)) {
    issues.push({
      code: 'invalid_status',
      message: 'status must be a valid game status',
      path: 'status',
      severity: 'error'
    });
  }

  if (!VALID_GAME_PHASE.includes(state.phase)) {
    issues.push({
      code: 'invalid_phase',
      message: 'phase must be a valid game phase',
      path: 'phase',
      severity: 'error'
    });
  }

  if (!VALID_GAME_SUBPHASE.includes(state.subphase)) {
    issues.push({
      code: 'invalid_subphase',
      message: 'subphase must be a valid game subphase',
      path: 'subphase',
      severity: 'error'
    });
  }

  if (!is_subphase_valid_for_phase(state.phase, state.subphase)) {
    issues.push({
      code: 'invalid_phase_subphase_combination',
      message: `subphase ${state.subphase} is invalid for phase ${state.phase}`,
      path: 'subphase',
      severity: 'error'
    });
  }

  const seen = new Set<string>();
  for (const [index, player_id] of state.seat_order.entries()) {
    if (!state.players_by_id[player_id]) {
      issues.push({
        code: 'seat_order_player_missing',
        message: `seat_order references missing player: ${player_id}`,
        path: `seat_order.${index}`,
        severity: 'error'
      });
    }

    if (seen.has(player_id)) {
      issues.push({
        code: 'seat_order_duplicate_player',
        message: `seat_order contains duplicate player: ${player_id}`,
        path: `seat_order.${index}`,
        severity: 'error'
      });
    }
    seen.add(player_id);
  }

  for (const [player_key, player] of Object.entries(state.players_by_id)) {
    if (player.player_id !== player_key) {
      issues.push({
        code: 'player_key_mismatch',
        message: `players_by_id key ${player_key} does not match player_id ${player.player_id}`,
        path: `players_by_id.${player_key}.player_id`,
        severity: 'error'
      });
    }

    if (!has_required_player_fields(player)) {
      issues.push({
        code: 'player_missing_required_field',
        message: `player ${player_key} is missing required fields`,
        path: `players_by_id.${player_key}`,
        severity: 'error'
      });
    }

    if (player.alive && !player.dead_vote_available) {
      issues.push({
        code: 'alive_player_spent_dead_vote',
        message: `alive player ${player_key} should not have spent dead vote`,
        path: `players_by_id.${player_key}.dead_vote_available`,
        severity: 'warning'
      });
    }
  }

  if (state.day_state.active_vote) {
    const active_nomination_exists = state.day_state.nominations_today.some(
      (nomination) => nomination.nomination_id === state.day_state.active_vote?.nomination_id
    );
    if (!active_nomination_exists) {
      issues.push({
        code: 'active_vote_nomination_missing',
        message: 'active vote references a nomination that does not exist in nominations_today',
        path: 'day_state.active_vote.nomination_id',
        severity: 'error'
      });
    }
  }

  const seenWakeIds = new Set<string>();
  for (const [index, wake] of state.wake_queue.entries()) {
    if (wake.wake_id.trim().length === 0 || wake.character_id.trim().length === 0) {
      issues.push({
        code: 'wake_queue_invalid_entry',
        message: 'wake_queue entry must include non-empty wake_id and character_id',
        path: `wake_queue.${index}`,
        severity: 'error'
      });
    }

    if (seenWakeIds.has(wake.wake_id)) {
      issues.push({
        code: 'duplicate_wake_queue_id',
        message: `wake_queue contains duplicate wake id: ${wake.wake_id}`,
        path: `wake_queue.${index}`,
        severity: 'error'
      });
    }
    seenWakeIds.add(wake.wake_id);

    if (!state.players_by_id[wake.player_id]) {
      issues.push({
        code: 'wake_queue_player_missing',
        message: `wake_queue references missing player: ${wake.player_id}`,
        path: `wake_queue.${index}.player_id`,
        severity: 'error'
      });
    }
  }

  const seenInterruptIds = new Set<string>();
  for (const [index, interrupt] of state.interrupt_queue.entries()) {
    if (
      interrupt.interrupt_id.trim().length === 0 ||
      interrupt.kind.trim().length === 0 ||
      interrupt.source_plugin_id.trim().length === 0
    ) {
      issues.push({
        code: 'interrupt_queue_invalid_entry',
        message:
          'interrupt_queue entry must include non-empty interrupt_id, kind, and source_plugin_id',
        path: `interrupt_queue.${index}`,
        severity: 'error'
      });
    }

    if (seenInterruptIds.has(interrupt.interrupt_id)) {
      issues.push({
        code: 'duplicate_interrupt_queue_id',
        message: `interrupt_queue contains duplicate interrupt id: ${interrupt.interrupt_id}`,
        path: `interrupt_queue.${index}`,
        severity: 'error'
      });
    }
    seenInterruptIds.add(interrupt.interrupt_id);
  }

  const seen_pending_prompt_ids = new Set<string>();
  for (const [index, prompt_id] of state.pending_prompts.entries()) {
    if (seen_pending_prompt_ids.has(prompt_id)) {
      issues.push({
        code: 'duplicate_pending_prompt_id',
        message: `pending_prompts contains duplicate prompt id: ${prompt_id}`,
        path: `pending_prompts.${index}`,
        severity: 'error'
      });
    }
    seen_pending_prompt_ids.add(prompt_id);

    const prompt = state.prompts_by_id[prompt_id];
    if (!prompt) {
      issues.push({
        code: 'pending_prompt_missing',
        message: `pending_prompts references missing prompt: ${prompt_id}`,
        path: `pending_prompts.${index}`,
        severity: 'error'
      });
      continue;
    }

    if (prompt.status !== 'pending') {
      issues.push({
        code: 'pending_prompt_not_pending',
        message: `pending prompt ${prompt_id} has non-pending status ${prompt.status}`,
        path: `prompts_by_id.${prompt_id}.status`,
        severity: 'error'
      });
    }
  }

  for (const [prompt_id, prompt] of Object.entries(state.prompts_by_id)) {
    if (prompt.status !== 'pending' && prompt.resolved_at_event_id === null) {
      issues.push({
        code: 'resolved_prompt_missing_event_id',
        message: `prompt ${prompt_id} is ${prompt.status} but has no resolved_at_event_id`,
        path: `prompts_by_id.${prompt_id}.resolved_at_event_id`,
        severity: 'error'
      });
    }
  }

  if (state.status !== 'ended' && state.winning_team !== null) {
    issues.push({
      code: 'winning_team_present_before_end',
      message: 'winning_team must be null unless game status is ended',
      path: 'winning_team',
      severity: 'error'
    });
  }

  if (state.status === 'ended') {
    if (state.winning_team === null || state.end_reason === null) {
      issues.push({
        code: 'ended_game_missing_outcome',
        message: 'ended game must include winning_team and end_reason',
        path: 'status',
        severity: 'error'
      });
    }
  }

  return issues;
}
