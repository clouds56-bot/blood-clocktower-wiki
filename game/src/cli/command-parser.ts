import type { GameState } from '../domain/types.js';
import { CLI_USAGE } from './command-registry.js';
import { type ParsedCliLine, invalid } from './parser-common.js';
import { parse_day_domain_command } from './parser-day.js';
import { parse_marker_domain_command } from './parser-markers.js';
import { parse_prompt_domain_command } from './parser-prompt.js';
import { parse_setup_domain_command } from './parser-setup.js';
import { parse_view_domain_command } from './parser-view.js';

export type { CliLocalAction, ParsedCliLine } from './parser-common.js';

export interface ParseCliOptions {
  script_mode?: boolean;
}

type DomainParser = (
  command: string,
  args: string[],
  state?: GameState,
  options?: ParseCliOptions
) => ParsedCliLine | null;

const DOMAIN_PARSERS: DomainParser[] = [
  parse_setup_domain_command,
  parse_view_domain_command,
  parse_prompt_domain_command,
  parse_marker_domain_command,
  parse_day_domain_command
];

export function parse_cli_line(input: string, state?: GameState, options?: ParseCliOptions): ParsedCliLine {
  const line = input.trim();
  if (line.length === 0) {
    return { ok: true, kind: 'empty' };
  }

  const parts = line.split(/\s+/);
  const [raw_command, ...args] = parts;
  const command = raw_command?.toLowerCase();

  if (!command) {
    return { ok: true, kind: 'empty' };
  }

  for (const parse_domain of DOMAIN_PARSERS) {
    const parsed = parse_domain(command, args, state, options);
    if (parsed) {
      return parsed;
    }
  }

  return invalid(`unknown command: ${command}. run "${CLI_USAGE.help}" for available commands.`);
}
