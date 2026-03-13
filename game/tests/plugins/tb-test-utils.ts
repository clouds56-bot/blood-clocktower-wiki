import type { PlayerState } from '../../src/domain/types.js';

interface MakePlayerOptions {
  alive?: boolean;
  is_demon?: boolean;
  poisoned?: boolean;
  drunk?: boolean;
  is_traveller?: boolean;
  perceived_character_id?: string | null;
}

export function make_player(
  player_id: string,
  display_name: string,
  true_character_id: string,
  true_alignment: 'good' | 'evil',
  options: MakePlayerOptions = {}
): PlayerState {
  return {
    player_id,
    display_name,
    alive: options.alive ?? true,
    dead_vote_available: true,
    true_character_id,
    perceived_character_id: options.perceived_character_id ?? null,
    true_alignment,
    registered_character_id: null,
    registered_alignment: null,
    drunk: options.drunk ?? false,
    poisoned: options.poisoned ?? false,
    is_traveller: options.is_traveller ?? false,
    is_demon: options.is_demon ?? false
  };
}
