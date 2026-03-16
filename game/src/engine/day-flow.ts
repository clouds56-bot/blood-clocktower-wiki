import type {
  CastVoteCommand,
  CloseVoteCommand,
  EndDayCommand,
  UseClaimedAbilityCommand,
  NominatePlayerCommand,
  OpenNominationWindowCommand,
  OpenVoteCommand,
  ResolveExecutionCommand
} from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState } from '../domain/types.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type { EngineResult } from './phase-machine.js';

function time_key_for_day(day_number: number): string {
  return `d${day_number}`;
}

function build_plugin_prompt_key(character_id: string, time_key: string, player_id: string, action: string): string {
  return `plugin:${character_id}:${time_key}:${player_id}:${action}`;
}

function error(code: string, message: string): EngineResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function ensure_day_context(state: GameState, day_number: number): EngineResult<true> {
  if (state.phase !== 'day') {
    return error('invalid_phase_for_day_action', `day action requires phase=day but got ${state.phase}`);
  }
  if (state.day_number !== day_number) {
    return error(
      'day_number_mismatch',
      `day_number mismatch: expected ${state.day_number} but got ${day_number}`
    );
  }
  return { ok: true, value: true };
}

export function handle_open_nomination_window(
  state: GameState,
  command: OpenNominationWindowCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const day_context = ensure_day_context(state, command.payload.day_number);
  if (!day_context.ok) {
    return day_context;
  }

  if (state.day_state.nomination_window_open) {
    return error('nomination_window_already_open', 'nomination window is already open');
  }

  return {
    ok: true,
    value: [
      {
        event_key: `${command.command_id}:PhaseAdvanced`,
        event_id: 1,
        event_type: 'PhaseAdvanced',
        created_at,
        actor_id: command.actor_id,
        payload: {
          phase: 'day',
          subphase: 'nomination_window',
          day_number: state.day_number,
          night_number: state.night_number
        }
      },
      {
        event_key: `${command.command_id}:NominationWindowOpened`,
        event_id: 1,
        event_type: 'NominationWindowOpened',
        created_at,
        actor_id: command.actor_id,
        payload: {
          day_number: command.payload.day_number
        }
      }
    ]
  };
}

export function handle_nominate_player(
  state: GameState,
  command: NominatePlayerCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const day_context = ensure_day_context(state, command.payload.day_number);
  if (!day_context.ok) {
    return day_context;
  }

  if (!state.day_state.nomination_window_open || state.subphase !== 'nomination_window') {
    return error(
      'nomination_window_not_open',
      `nomination requires nomination_window subphase with open window; got phase=${state.phase} subphase=${state.subphase} nomination_window_open=${state.day_state.nomination_window_open}`
    );
  }

  const nominator = state.players_by_id[command.payload.nominator_player_id];
  const nominee = state.players_by_id[command.payload.nominee_player_id];

  if (!nominator || !nominee) {
    return error('player_not_found', 'nominator or nominee not found');
  }
  if (!nominator.alive) {
    return error('dead_player_cannot_nominate', 'dead players cannot nominate');
  }
  if (state.day_state.has_nominated_today[command.payload.nominator_player_id]) {
    return error('already_nominated_today', 'player has already nominated today');
  }
  if (state.day_state.has_been_nominated_today[command.payload.nominee_player_id]) {
    return error('already_been_nominated_today', 'target has already been nominated today');
  }

  const events: DomainEvent[] = [
    {
      event_key: `${command.command_id}:NominationMade`,
      event_id: 1,
      event_type: 'NominationMade',
      created_at,
      actor_id: command.actor_id,
      payload: {
        nomination_id: command.payload.nomination_id,
        day_number: command.payload.day_number,
        nominator_player_id: command.payload.nominator_player_id,
        nominee_player_id: command.payload.nominee_player_id
      }
    }
  ];

  return {
    ok: true,
    value: events
  };
}

export function handle_use_claimed_ability(
  state: GameState,
  command: UseClaimedAbilityCommand,
  created_at: string,
  plugin_registry?: PluginRegistry
): EngineResult<DomainEvent[]> {
  if (state.phase !== 'day') {
    return error(
      'invalid_phase_for_claimed_ability',
      `claimed ability requires phase=day but got ${state.phase}`
    );
  }

  if (!plugin_registry) {
    return error('plugin_registry_required', 'claimed ability handling requires plugin registry');
  }

  const claimant = state.players_by_id[command.payload.claimant_player_id];
  if (!claimant) {
    return error('player_not_found', 'claimant not found');
  }
  if (!claimant.alive) {
    return error('dead_player_cannot_claim_ability', 'dead player cannot make claimed ability attempt');
  }

  const claimed_plugin = plugin_registry.get(command.payload.claimed_character_id);
  if (!claimed_plugin) {
    return error(
      'claimed_character_plugin_not_found',
      `claimed character plugin not found: ${command.payload.claimed_character_id}`
    );
  }
  if (claimed_plugin.metadata.timing_category !== 'day') {
    return error(
      'invalid_claimed_ability_timing',
      `claimed ability timing must be day but got ${claimed_plugin.metadata.timing_category}`
    );
  }

  const constraints = claimed_plugin.metadata.target_constraints;
  if (constraints.min_targets !== 1 || constraints.max_targets !== 1) {
    return error(
      'unsupported_claimed_ability_target_constraints',
      'claimed ability currently supports exactly one target'
    );
  }

  const options = Object.values(state.players_by_id)
    .filter((player) => {
      if (!constraints.allow_self && player.player_id === claimant.player_id) {
        return false;
      }
      if (constraints.require_alive && !player.alive) {
        return false;
      }
      if (!constraints.allow_travellers && player.is_traveller) {
        return false;
      }
      return true;
    })
    .map((player) => ({
      option_id: player.player_id,
      label: player.display_name
    }));

  if (options.length === 0) {
    return error('no_valid_claimed_ability_targets', 'no valid targets for claimed ability');
  }

  return {
    ok: true,
    value: [
      {
        event_key: `${command.command_id}:ClaimedAbilityPromptQueued`,
        event_id: 1,
        event_type: 'PromptQueued',
        created_at,
        actor_id: command.actor_id,
        payload: {
          prompt_id: `plugin:${command.payload.claimed_character_id}:claimed_ability:${state.day_number}:${claimant.player_id}:${command.command_id}`,
          prompt_key: build_plugin_prompt_key(
            command.payload.claimed_character_id,
            time_key_for_day(state.day_number),
            claimant.player_id,
            `claimed_ability:${command.command_id}`
          ),
          kind: 'claimed_ability_target',
          reason: build_plugin_prompt_key(
            command.payload.claimed_character_id,
            time_key_for_day(state.day_number),
            claimant.player_id,
            'claimed_ability'
          ),
          visibility: 'public',
          options,
          selection_mode: 'single_choice',
          number_range: null,
          multi_columns: null,
          storyteller_hint: `claimant=${claimant.player_id};claimed=${command.payload.claimed_character_id}`
        }
      }
    ]
  };
}

export function handle_open_vote(
  state: GameState,
  command: OpenVoteCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  if (state.phase !== 'day' || state.subphase !== 'nomination_window') {
    return error('invalid_phase_for_open_vote', 'open vote requires day/nomination_window');
  }
  if (state.day_state.active_vote) {
    return error('vote_already_open', 'a vote is already open');
  }

  const nomination = state.day_state.nominations_today.find(
    (item) => item.nomination_id === command.payload.nomination_id
  );
  if (!nomination) {
    return error('nomination_not_found', 'cannot open vote for unknown nomination');
  }

  return {
    ok: true,
    value: [
      {
        event_key: `${command.command_id}:PhaseAdvanced`,
        event_id: 1,
        event_type: 'PhaseAdvanced',
        created_at,
        actor_id: command.actor_id,
        payload: {
          phase: 'day',
          subphase: 'vote_in_progress',
          day_number: state.day_number,
          night_number: state.night_number
        }
      },
      {
        event_key: `${command.command_id}:VoteOpened`,
        event_id: 1,
        event_type: 'VoteOpened',
        created_at,
        actor_id: command.actor_id,
        payload: {
          nomination_id: command.payload.nomination_id,
          nominee_player_id: command.payload.nominee_player_id,
          opened_by_player_id: command.payload.opened_by_player_id
        }
      }
    ]
  };
}

export function handle_cast_vote(
  state: GameState,
  command: CastVoteCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  if (state.phase !== 'day' || state.subphase !== 'vote_in_progress') {
    return error('invalid_phase_for_cast_vote', 'cast vote requires day/vote_in_progress');
  }
  const active_vote = state.day_state.active_vote;
  if (!active_vote) {
    return error('active_vote_not_found', 'cannot cast vote without active vote');
  }
  if (active_vote.nomination_id !== command.payload.nomination_id) {
    return error('nomination_id_mismatch', 'vote nomination_id does not match active vote');
  }
  if (!state.players_by_id[command.payload.voter_player_id]) {
    return error('player_not_found', 'voter not found');
  }
  const voter = state.players_by_id[command.payload.voter_player_id];
  if (!voter) {
    return error('player_not_found', 'voter not found');
  }
  if (!voter.alive && command.payload.in_favor && !voter.dead_vote_available) {
    return error('dead_vote_not_available', 'dead player has no remaining dead vote');
  }

  const events: DomainEvent[] = [
    {
      event_key: `${command.command_id}:VoteCast`,
      event_id: 1,
      event_type: 'VoteCast',
      created_at,
      actor_id: command.actor_id,
      payload: {
        nomination_id: command.payload.nomination_id,
        voter_player_id: command.payload.voter_player_id,
        in_favor: command.payload.in_favor
      }
    }
  ];

  if (!voter.alive && command.payload.in_favor) {
    events.push({
      event_key: `${command.command_id}:DeadVoteConsumed`,
      event_id: 1,
      event_type: 'DeadVoteConsumed',
      created_at,
      actor_id: command.actor_id,
      payload: {
        player_id: command.payload.voter_player_id,
        day_number: state.day_number
      }
    });
  }

  return {
    ok: true,
    value: events
  };
}

export function handle_close_vote(
  state: GameState,
  command: CloseVoteCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const day_context = ensure_day_context(state, command.payload.day_number);
  if (!day_context.ok) {
    return day_context;
  }
  if (state.subphase !== 'vote_in_progress') {
    return error('invalid_phase_for_close_vote', 'close vote requires day/vote_in_progress');
  }

  const active_vote = state.day_state.active_vote;
  if (!active_vote || active_vote.nomination_id !== command.payload.nomination_id) {
    return error('active_vote_not_found', 'active vote not found for nomination');
  }

  const alive_player_count = Object.values(state.players_by_id).filter((player) => player.alive).length;
  const threshold = Math.ceil(alive_player_count / 2);
  const vote_total = Object.values(active_vote.votes_by_player_id).filter(Boolean).length;

  return {
    ok: true,
    value: [
      {
        event_key: `${command.command_id}:VoteClosed`,
        event_id: 1,
        event_type: 'VoteClosed',
        created_at,
        actor_id: command.actor_id,
        payload: {
          nomination_id: command.payload.nomination_id,
          day_number: command.payload.day_number,
          vote_total,
          threshold
        }
      },
      {
        event_key: `${command.command_id}:PhaseAdvanced`,
        event_id: 1,
        event_type: 'PhaseAdvanced',
        created_at,
        actor_id: command.actor_id,
        payload: {
          phase: 'day',
          subphase: 'nomination_window',
          day_number: state.day_number,
          night_number: state.night_number
        }
      }
    ]
  };
}

export function handle_resolve_execution(
  state: GameState,
  command: ResolveExecutionCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const day_context = ensure_day_context(state, command.payload.day_number);
  if (!day_context.ok) {
    return day_context;
  }
  if (state.subphase !== 'nomination_window' && state.subphase !== 'execution_resolution') {
    return error(
      'invalid_phase_for_execution_resolution',
      'resolve execution requires day/nomination_window or day/execution_resolution'
    );
  }
  if (state.day_state.active_vote) {
    return error('active_vote_in_progress', 'cannot resolve execution while vote is in progress');
  }
  if (state.day_state.execution_attempted_today) {
    return error('execution_already_attempted_today', 'execution already attempted this day');
  }

  const eligible = state.day_state.nominations_today.filter((nomination) => {
    if (nomination.vote_total === null || nomination.threshold === null) {
      return false;
    }
    return nomination.vote_total >= nomination.threshold;
  });

  if (eligible.length === 0) {
    return {
      ok: true,
      value: [
        {
          event_key: `${command.command_id}:PhaseAdvanced`,
          event_id: 1,
          event_type: 'PhaseAdvanced',
          created_at,
          actor_id: command.actor_id,
          payload: {
            phase: 'day',
            subphase: 'execution_resolution',
            day_number: state.day_number,
            night_number: state.night_number
          }
        },
        {
          event_key: `${command.command_id}:ExecutionResolutionCompleted`,
          event_id: 1,
          event_type: 'ExecutionResolutionCompleted',
          created_at,
          actor_id: command.actor_id,
          payload: {
            day_number: state.day_number,
            had_execution: false
          }
        }
      ]
    };
  }

  const max_vote_total = Math.max(...eligible.map((nomination) => nomination.vote_total as number));
  const top = eligible.filter((nomination) => nomination.vote_total === max_vote_total);

  if (top.length !== 1) {
    return {
      ok: true,
      value: [
        {
          event_key: `${command.command_id}:PhaseAdvanced`,
          event_id: 1,
          event_type: 'PhaseAdvanced',
          created_at,
          actor_id: command.actor_id,
          payload: {
            phase: 'day',
            subphase: 'execution_resolution',
            day_number: state.day_number,
            night_number: state.night_number
          }
        },
        {
          event_key: `${command.command_id}:ExecutionResolutionCompleted`,
          event_id: 1,
          event_type: 'ExecutionResolutionCompleted',
          created_at,
          actor_id: command.actor_id,
          payload: {
            day_number: state.day_number,
            had_execution: false
          }
        }
      ]
    };
  }

  const winner = top[0];
  if (!winner) {
    return error('execution_candidate_missing', 'unable to resolve execution candidate');
  }

  return {
    ok: true,
    value: [
      {
        event_key: `${command.command_id}:PhaseAdvanced`,
        event_id: 1,
        event_type: 'PhaseAdvanced',
        created_at,
        actor_id: command.actor_id,
        payload: {
          phase: 'day',
          subphase: 'execution_resolution',
          day_number: state.day_number,
          night_number: state.night_number
        }
      },
      {
        event_key: `${command.command_id}:ExecutionOccurred`,
        event_id: 1,
        event_type: 'ExecutionOccurred',
        created_at,
        actor_id: command.actor_id,
        payload: {
          day_number: state.day_number,
          nomination_id: winner.nomination_id,
          player_id: winner.nominee_player_id
        }
      },
      {
        event_key: `${command.command_id}:PlayerExecuted`,
        event_id: 1,
        event_type: 'PlayerExecuted',
        created_at,
        actor_id: command.actor_id,
        payload: {
          day_number: state.day_number,
          player_id: winner.nominee_player_id
        }
      },
      {
        event_key: `${command.command_id}:ExecutionResolutionCompleted`,
        event_id: 1,
        event_type: 'ExecutionResolutionCompleted',
        created_at,
        actor_id: command.actor_id,
        payload: {
          day_number: state.day_number,
          had_execution: true
        }
      }
    ]
  };
}

export function handle_end_day(
  state: GameState,
  command: EndDayCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const day_context = ensure_day_context(state, command.payload.day_number);
  if (!day_context.ok) {
    return day_context;
  }
  if (!state.day_state.execution_attempted_today) {
    return error('execution_not_resolved', 'cannot end day before execution is resolved');
  }
  if (state.subphase !== 'execution_resolution') {
    return error('invalid_subphase_for_end_day', 'end day requires day/execution_resolution');
  }
  if (state.day_state.execution_occurred_today && !state.day_state.execution_consequences_resolved_today) {
    return error(
      'execution_consequences_not_resolved',
      'cannot end day before execution consequences are resolved'
    );
  }

  return {
    ok: true,
    value: [
      {
        event_key: `${command.command_id}:PhaseAdvanced`,
        event_id: 1,
        event_type: 'PhaseAdvanced',
        created_at,
        actor_id: command.actor_id,
        payload: {
          phase: 'night',
          subphase: 'dusk',
          day_number: state.day_number,
          night_number: state.night_number + 1
        }
      }
    ]
  };
}
