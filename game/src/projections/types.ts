import type {
  Alignment,
  PlayerCharacterType,
  DayState,
  PlayerId,
  GameId,
  GamePhase,
  GameStatus,
  GameSubphase,
  PromptState,
  ScriptId,
  EditionId,
  ReminderMarkerState,
  StorytellerNoteRecord
} from '../domain/types.js';

export interface ProjectionError {
  code: string;
  message: string;
}

export type ProjectionResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: ProjectionError;
    };

export interface ProjectionClock {
  status: GameStatus;
  phase: GamePhase;
  subphase: GameSubphase;
  day_number: number;
  night_number: number;
}

export interface PublicPlayerView {
  player_id: PlayerId;
  display_name: string;
  alive: boolean;
  dead_vote_available: boolean;
}

export interface PlayerSelfView extends PublicPlayerView {
  perceived_character_id: string | null;
  known_alignment: Alignment | null;
}

export interface PublicProjection {
  game_id: GameId;
  script_id: ScriptId | null;
  edition_id: EditionId | null;
  clock: ProjectionClock;
  players: PublicPlayerView[];
  seat_order: PlayerId[];
  day_state: DayState;
  winning_team: Alignment | null;
  end_reason: string | null;
}

export interface PlayerProjection extends PublicProjection {
  viewer_player_id: PlayerId;
  self: PlayerSelfView;
}

export interface StorytellerProjection {
  game_id: GameId;
  script_id: ScriptId | null;
  edition_id: EditionId | null;
  clock: ProjectionClock;
  players: Record<PlayerId, {
    player_id: PlayerId;
    display_name: string;
    alive: boolean;
    dead_vote_available: boolean;
    true_character_id: string | null;
    true_character_type?: PlayerCharacterType | null;
    perceived_character_id: string | null;
    true_alignment: Alignment | null;
    registered_character_id: string | null;
    registered_alignment: Alignment | null;
    drunk: boolean;
    poisoned: boolean;
    is_traveller: boolean;
    is_demon: boolean;
  }>;
  seat_order: PlayerId[];
  day_state: DayState;
  prompts: PromptState[];
  reminder_markers: ReminderMarkerState[];
  storyteller_notes: StorytellerNoteRecord[];
  winning_team: Alignment | null;
  end_reason: string | null;
}
