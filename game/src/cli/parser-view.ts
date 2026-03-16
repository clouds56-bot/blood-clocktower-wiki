import type { GameState } from '../domain/types.js';
import { invalid, type ParsedCliLine } from './parser-common.js';
import { CLI_USAGE } from './command-registry.js';

export function parse_view_domain_command(
  command: string,
  args: string[],
  _state?: GameState
): ParsedCliLine | null {
  if (command !== 'view') {
    return null;
  }

  const json = args.includes('--json');
  const tokens = args.filter((token) => token !== '--json');
  const mode = tokens[0];

  if (mode === 'storyteller' || mode === 'st') {
    return { ok: true, kind: 'local', action: { type: 'view_storyteller', json } };
  }
  if (mode === 'public') {
    return { ok: true, kind: 'local', action: { type: 'view_public', json } };
  }
  if (mode === 'player') {
    const player_id = tokens[1];
    if (!player_id) {
      return invalid(`usage: ${CLI_USAGE.view_player}`);
    }
    return { ok: true, kind: 'local', action: { type: 'view_player', player_id, json } };
  }
  if (mode && mode !== 'public' && mode !== 'storyteller' && mode !== 'st') {
    return { ok: true, kind: 'local', action: { type: 'view_player', player_id: mode, json } };
  }

  return invalid(`usage: ${CLI_USAGE.view_storyteller} | ${CLI_USAGE.view_public} | ${CLI_USAGE.view_player}`);
}
