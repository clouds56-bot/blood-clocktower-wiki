import type { GameState, PlayerState } from '../../domain/types.js';

export function is_functional_player(state: Readonly<GameState>, player_id: string): boolean {
  const player = state.players_by_id[player_id];
  return Boolean(player && player.alive && !player.drunk && !player.poisoned);
}

export function find_alive_neighbors(state: Readonly<GameState>, player_id: string): PlayerState[] {
  const seats = state.seat_order;
  const seat_count = seats.length;
  if (seat_count === 0) {
    return [];
  }

  const index = seats.indexOf(player_id);
  if (index === -1) {
    return [];
  }

  const neighbors: PlayerState[] = [];

  for (let offset = 1; offset < seat_count; offset += 1) {
    const left_index = (index - offset + seat_count) % seat_count;
    const left_player_id = seats[left_index];
    if (!left_player_id) {
      continue;
    }
    const left_player = state.players_by_id[left_player_id];
    if (left_player && left_player.alive) {
      neighbors.push(left_player);
      break;
    }
  }

  for (let offset = 1; offset < seat_count; offset += 1) {
    const right_index = (index + offset) % seat_count;
    const right_player_id = seats[right_index];
    if (!right_player_id) {
      continue;
    }
    const right_player = state.players_by_id[right_player_id];
    if (right_player && right_player.alive) {
      neighbors.push(right_player);
      break;
    }
  }

  return neighbors;
}

export function list_players_by_true_alignment(
  state: Readonly<GameState>,
  alignment: 'good' | 'evil'
): PlayerState[] {
  return state.seat_order
    .map((player_id) => state.players_by_id[player_id])
    .filter((player): player is PlayerState => Boolean(player && player.true_alignment === alignment));
}

export function list_players_by_true_character_type(
  state: Readonly<GameState>,
  character_type: 'townsfolk' | 'outsider' | 'minion' | 'demon'
): PlayerState[] {
  return state.seat_order
    .map((player_id) => state.players_by_id[player_id])
    .filter((player): player is PlayerState => {
      if (!player || !player.true_character_id) {
        return false;
      }
      return classify_tb_character_type(player.true_character_id) === character_type;
    });
}

export function classify_tb_character_type(
  character_id: string
): 'townsfolk' | 'outsider' | 'minion' | 'demon' | null {
  if (TB_TOWNSFOLK.has(character_id)) {
    return 'townsfolk';
  }
  if (TB_OUTSIDERS.has(character_id)) {
    return 'outsider';
  }
  if (TB_MINIONS.has(character_id)) {
    return 'minion';
  }
  if (TB_DEMONS.has(character_id)) {
    return 'demon';
  }
  return null;
}

const TB_TOWNSFOLK: ReadonlySet<string> = new Set([
  'chef',
  'empath',
  'fortune_teller',
  'investigator',
  'librarian',
  'mayor',
  'monk',
  'ravenkeeper',
  'slayer',
  'soldier',
  'undertaker',
  'virgin',
  'washerwoman'
]);

const TB_OUTSIDERS: ReadonlySet<string> = new Set(['butler', 'drunk', 'recluse', 'saint']);

const TB_MINIONS: ReadonlySet<string> = new Set(['baron', 'poisoner', 'scarlet_woman', 'spy']);

const TB_DEMONS: ReadonlySet<string> = new Set(['imp']);
