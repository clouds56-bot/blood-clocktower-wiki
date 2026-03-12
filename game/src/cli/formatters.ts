import type { DomainEvent } from '../domain/events.js';
import type { GameState, PlayerState } from '../domain/types.js';

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
} as const;

function color_enabled(): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  return Boolean(process.stdout.isTTY);
}

function paint(text: string, color: keyof typeof ANSI): string {
  if (!color_enabled() || color === 'reset') {
    return text;
  }
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

function event_color(event_type: DomainEvent['event_type']): keyof typeof ANSI {
  if (event_type === 'GameEnded' || event_type === 'GameWon' || event_type === 'ForcedVictoryDeclared') {
    return 'magenta';
  }
  if (event_type === 'PlayerDied' || event_type === 'PlayerExecuted') {
    return 'red';
  }
  if (event_type === 'PhaseAdvanced') {
    return 'blue';
  }
  if (
    event_type === 'NominationMade' ||
    event_type === 'VoteOpened' ||
    event_type === 'VoteCast' ||
    event_type === 'VoteClosed'
  ) {
    return 'yellow';
  }
  if (event_type === 'WinCheckCompleted' || event_type === 'ExecutionResolutionCompleted') {
    return 'cyan';
  }
  return 'gray';
}

export function format_state_brief(state: GameState): string {
  const players = Object.values(state.players_by_id);
  const alive_count = players.filter((player) => player.alive).length;
  const dead_count = players.length - alive_count;

  return [
    `game=${state.game_id} status=${state.status}`,
    `phase=${state.phase}/${state.subphase} day=${state.day_number} night=${state.night_number}`,
    `players total=${players.length} alive=${alive_count} dead=${dead_count}`,
    `today nominations=${state.day_state.nominations_today.length} execution_occurred=${state.day_state.execution_occurred_today} outcome=${state.day_state.execution_outcome}`,
    `history executions=${state.execution_history.length} deaths=${state.death_history.length}`,
    `outcome winning_team=${state.winning_team ?? 'none'} end_reason=${state.end_reason ?? 'none'}`
  ].join('\n');
}

export function format_state_json(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

export function format_event(event: DomainEvent, index: number): string {
  return `#${index} ${paint(event.event_type, event_color(event.event_type))} ${JSON.stringify(event.payload)}`;
}

export function format_player(player: PlayerState): string {
  return [
    `player_id=${player.player_id} display_name=${player.display_name}`,
    `alive=${player.alive} dead_vote_available=${player.dead_vote_available}`,
    `true_character_id=${player.true_character_id ?? 'null'} perceived_character_id=${player.perceived_character_id ?? 'null'}`,
    `true_alignment=${player.true_alignment ?? 'null'} registered_alignment=${player.registered_alignment ?? 'null'}`,
    `drunk=${player.drunk} poisoned=${player.poisoned} is_demon=${player.is_demon} is_traveller=${player.is_traveller}`
  ].join('\n');
}

export function format_players_table(state: GameState): string {
  const rows = Object.values(state.players_by_id)
    .map((player) => {
      const life = player.alive ? paint('alive', 'green') : paint('dead', 'red');
      return `${player.player_id}\t${player.display_name}\t${life}\tdead_vote=${player.dead_vote_available}`;
    })
    .sort();

  if (rows.length === 0) {
    return 'no players';
  }

  return ['player_id\tdisplay_name\tlife\tdead_vote', ...rows].join('\n');
}

export function format_help(topic: 'phase' | 'all'): string {
  if (topic === 'phase') {
    return [
      paint('phase flow (phase 3 + 3.1):', 'cyan'),
      '  next-phase',
      '  open-noms',
      '  nominate p1 p2',
      '  open-vote',
      '  vote p1 yes',
      '  close-vote',
      '  resolve-exec',
      '  resolve-conseq   (or survive-exec)',
      '  check-win',
      '  end-day'
    ].join('\n');
  }

  return [
    paint('local commands:', 'cyan'),
    '  help [all|phase]',
    '  next-phase | next | n',
    '  new <game_id>',
    '  quick-setup | quick-start | start <script> <player_num> [game_id]',
    '  state [brief|json]',
    '  events [count]',
    '  players',
    '  player <player_id>',
    '  quit | exit',
    '',
    paint('engine setup commands:', 'cyan'),
    '  select-script <script_id>',
    '  select-edition <edition_id>',
    '  add-player <player_id> <display_name>',
    '  set-seat-order <player_id...>',
    '  assign-character <player_id> <character_id> [--demon] [--traveller]',
    '  assign-perceived <player_id> <character_id>',
    '  assign-alignment <player_id> <good|evil>',
    '  phase <phase> <subphase> <day_number> <night_number>',
    '',
    paint('engine day/death/win commands:', 'cyan'),
    '  open-noms [day_number]',
    '  nominate | nom <nominator_id> <nominee_id>',
    '  nominate | nom <nomination_id> <nominator_id> <nominee_id>',
    '  nominate | nom <nomination_id> <day_number> <nominator_id> <nominee_id>',
    '  open-vote [nomination_id] [opened_by_id]',
    '  vote <voter_id> <yes|no> | vote <nomination_id> <voter_id> <yes|no>',
    '  close-vote [nomination_id] [day_number]',
    '  resolve-exec [day_number]',
    '  resolve-conseq [day_number]',
    '  apply-death <player_id> <execution|night_death|ability|storyteller> [day_number] [night_number]',
    '  survive-exec [player_id] [day_number]',
    '  check-win [day_number] [night_number]',
    '  force-win <good|evil> [rationale...]',
    '  end-day [day_number]'
  ].join('\n');
}
