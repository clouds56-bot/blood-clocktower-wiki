export function night_time_key(night_number: number): string {
  return `n${night_number}`;
}

export function build_night_prompt_key(
  role_id: string,
  verb: string,
  night_number: number,
  player_id: string
): string {
  return `plugin:${role_id}:${verb}:${night_time_key(night_number)}:${player_id}`;
}

export function parse_night_prompt_owner_player_id(
  prompt_key: string,
  role_id: string,
  verb: string
): string | null {
  const parts = prompt_key.split(':');
  if (
    parts.length >= 5 &&
    parts[0] === 'plugin' &&
    parts[1] === role_id &&
    parts[2] === verb &&
    /^n\d+$/.test(parts[3] ?? '')
  ) {
    return parts[4] ?? null;
  }
  return null;
}

export function is_night_prompt_key(prompt_key: string, role_id: string, verb: string): boolean {
  return parse_night_prompt_owner_player_id(prompt_key, role_id, verb) !== null;
}
