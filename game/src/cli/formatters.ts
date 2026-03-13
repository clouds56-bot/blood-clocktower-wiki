import Table from 'cli-table3';
import type { DomainEvent } from '../domain/events.js';
import type { GameState, PlayerState, PromptState } from '../domain/types.js';
import type { PlayerProjection, PublicProjection, StorytellerProjection } from '../projections/types.js';

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

export function format_projection_json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function render_table(head: string[], rows: string[][]): string {
  const table = new Table({ head });
  for (const row of rows) {
    table.push(row);
  }
  return table.toString();
}

export function format_public_projection(projection: PublicProjection): string {
  const header = [
    `game=${projection.game_id}`,
    `script=${projection.script_id ?? 'none'}`,
    `edition=${projection.edition_id ?? 'none'}`,
    `phase=${projection.clock.phase}/${projection.clock.subphase}`,
    `day=${projection.clock.day_number} night=${projection.clock.night_number}`
  ].join(' ');

  const players = render_table(
    ['player_id', 'display_name', 'alive', 'dead_vote_available'],
    projection.players.map((player) => [
      player.player_id,
      player.display_name,
      String(player.alive),
      String(player.dead_vote_available)
    ])
  );

  const day = [
    `nominations=${projection.day_state.nominations_today.length}`,
    `active_vote=${projection.day_state.active_vote?.nomination_id ?? 'none'}`,
    `execution_outcome=${projection.day_state.execution_outcome}`,
    `execution_occurred=${projection.day_state.execution_occurred_today}`,
    `winning_team=${projection.winning_team ?? 'none'}`,
    `end_reason=${projection.end_reason ?? 'none'}`
  ].join(' ');

  return [header, players, day].join('\n');
}

export function format_player_projection(projection: PlayerProjection): string {
  const base = format_public_projection(projection);
  const self = render_table(
    [
      'viewer_player_id',
      'perceived_character_id',
      'known_alignment',
      'registered_character_id',
      'registered_alignment'
    ],
    [[
      projection.viewer_player_id,
      projection.self.perceived_character_id ?? 'null',
      projection.self.known_alignment ?? 'null',
      projection.self.registered_character_id ?? 'null',
      projection.self.registered_alignment ?? 'null'
    ]]
  );
  return [base, self].join('\n');
}

export function format_storyteller_projection(projection: StorytellerProjection): string {
  const header = [
    `game=${projection.game_id}`,
    `script=${projection.script_id ?? 'none'}`,
    `edition=${projection.edition_id ?? 'none'}`,
    `phase=${projection.clock.phase}/${projection.clock.subphase}`,
    `day=${projection.clock.day_number} night=${projection.clock.night_number}`
  ].join(' ');

  const rows = Object.values(projection.players)
    .sort((a, b) => a.player_id.localeCompare(b.player_id))
    .map((player) => [
      player.player_id,
      player.display_name,
      player.true_character_id ?? 'null',
      player.perceived_character_id ?? 'null',
      player.true_alignment ?? 'null',
      String(player.alive),
      String(player.is_demon),
      String(player.is_traveller),
      String(player.drunk),
      String(player.poisoned)
    ]);

  const players = render_table(
    [
      'player_id',
      'display_name',
      'true_character_id',
      'perceived_character_id',
      'true_alignment',
      'alive',
      'is_demon',
      'is_traveller',
      'drunk',
      'poisoned'
    ],
    rows
  );

  const meta = [
    `prompts=${projection.prompts.length}`,
    `storyteller_notes=${projection.storyteller_notes.length}`,
    `winning_team=${projection.winning_team ?? 'none'}`,
    `end_reason=${projection.end_reason ?? 'none'}`
  ].join(' ');

  return [header, players, meta].join('\n');
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

export function format_prompt_list(state: GameState): string {
  if (state.pending_prompts.length === 0) {
    return 'no pending prompts';
  }

  const rows = state.pending_prompts.map((prompt_id) => {
    const prompt = state.prompts_by_id[prompt_id];
    if (!prompt) {
      return `${prompt_id}\t<missing>`;
    }
    return `${prompt.prompt_id}\t${prompt.kind}\t${prompt.visibility}\t${prompt.reason}`;
  });

  return ['prompt_id\tkind\tvisibility\treason', ...rows].join('\n');
}

export function format_prompt(prompt: PromptState): string {
  const options = prompt.options.length === 0
    ? 'none'
    : prompt.options.map((option) => `${option.option_id}:${option.label}`).join(', ');
  const selected_option_id = prompt.resolution_payload?.selected_option_id ?? 'null';
  const freeform = prompt.resolution_payload?.freeform ?? 'null';

  return [
    `prompt_id=${prompt.prompt_id} status=${prompt.status}`,
    `kind=${prompt.kind} visibility=${prompt.visibility}`,
    `reason=${prompt.reason}`,
    `options=${options}`,
    `selected_option_id=${selected_option_id} freeform=${freeform}`,
    `notes=${prompt.notes ?? 'null'} created_at_event_id=${prompt.created_at_event_id} resolved_at_event_id=${prompt.resolved_at_event_id ?? 'null'}`
  ].join('\n');
}

export function format_help(topic: 'phase' | 'all'): string {
  if (topic === 'phase') {
    return [
      paint('phase flow (phase 5):', 'cyan'),
      '  next-phase   (auto: open-noms/open-vote/close-vote/resolve-exec/resolve-conseq when applicable)',
      '  open-noms',
      '  nominate p1 p2',
      '  open-vote',
      '  vote p1 yes  | vote p1 p2 (defaults to yes)',
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
    '  view storyteller|st [--json]',
    '  view public [--json]',
    '  view player <player_id> [--json] | view <player_id> [--json]',
    '  prompts',
    '  prompt <prompt_id>',
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
    '  setup-player <player_id> <true_character_id> [perceived_character_id] <townsfolk|outsider|minion|demon|traveller> [good|evil]',
    '  phase <phase> <subphase> <day_number> <night_number>',
    '',
    paint('engine day/death/win commands:', 'cyan'),
    '  open-noms [day_number]',
    '  nominate | nom <nominator_id> <nominee_id>',
    '  nominate | nom <nomination_id> <nominator_id> <nominee_id>',
    '  nominate | nom <nomination_id> <day_number> <nominator_id> <nominee_id>',
    '  open-vote [nomination_id] [opened_by_id]',
    '  vote <voter_id> <yes|no> | vote <voter_id...> [yes|no] | vote <nomination_id> <voter_id> <yes|no>',
    '  close-vote [nomination_id] [day_number]',
    '  resolve-exec [day_number]',
    '  resolve-conseq [day_number]',
    '  apply-death <player_id> <execution|night_death|ability|storyteller> [day_number] [night_number]',
    '  survive-exec [player_id] [day_number]',
    '  check-win [day_number] [night_number]',
    '  force-win <good|evil> [rationale...]',
    '  create-prompt <prompt_id> <kind> <storyteller|player|public> <reason...>',
    '  resolve-prompt <prompt_id> [selected_option_id|-] [notes...]',
    '  cancel-prompt <prompt_id> <reason...>',
    '  end-day [day_number]'
  ].join('\n');
}
