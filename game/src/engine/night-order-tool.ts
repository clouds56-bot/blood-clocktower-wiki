import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface NightOrderToolStep {
  number?: unknown;
  id?: unknown;
  kind?: unknown;
}

interface NightOrderToolData {
  first_night?: unknown;
  other_night?: unknown;
}

interface LoadedNightOrder {
  first_night_character_order_by_id: Readonly<Record<string, number>>;
  other_night_character_order_by_id: Readonly<Record<string, number>>;
  first_night_special_order_by_number: readonly string[];
}

function repo_root_dir(): string {
  const current_file = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(current_file), '../../..');
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function is_step(value: unknown): value is NightOrderToolStep {
  return is_record(value);
}

function read_nightorder_tool_file(): NightOrderToolData | null {
  try {
    const file_path = path.resolve(repo_root_dir(), 'data/nightorder.tool.json');
    const content = readFileSync(file_path, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (!is_record(parsed)) {
      return null;
    }
    return parsed as NightOrderToolData;
  } catch {
    return null;
  }
}

function as_step_array(value: unknown): NightOrderToolStep[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(is_step);
}

function build_character_order_map(steps: NightOrderToolStep[]): Readonly<Record<string, number>> {
  const order: Record<string, number> = {};
  for (const step of steps) {
    if (step.kind !== 'character') {
      continue;
    }
    if (typeof step.id !== 'string' || step.id.trim().length === 0) {
      continue;
    }
    if (!Number.isFinite(step.number) || !Number.isInteger(step.number)) {
      continue;
    }
    const number = typeof step.number === 'number' ? step.number : null;
    if (number === null) {
      continue;
    }
    order[step.id] = number;
  }
  return order;
}

function build_special_first_night_order(steps: NightOrderToolStep[]): readonly string[] {
  return [...steps]
    .filter((step) => {
      return (
        step.kind === 'special' &&
        typeof step.id === 'string' &&
        step.id.trim().length > 0 &&
        Number.isFinite(step.number) &&
        Number.isInteger(step.number)
      );
    })
    .sort((left, right) => {
      const left_number = typeof left.number === 'number' ? left.number : Number.MAX_SAFE_INTEGER;
      const right_number = typeof right.number === 'number' ? right.number : Number.MAX_SAFE_INTEGER;
      return left_number - right_number;
    })
    .map((step) => step.id as string);
}

function load_night_order(): LoadedNightOrder {
  const tool_data = read_nightorder_tool_file();
  if (!tool_data) {
    return {
      first_night_character_order_by_id: {},
      other_night_character_order_by_id: {},
      first_night_special_order_by_number: ['minioninfo', 'demoninfo']
    };
  }

  const first_night_steps = as_step_array(tool_data.first_night);
  const other_night_steps = as_step_array(tool_data.other_night);

  const first_night_special_order_by_number = build_special_first_night_order(first_night_steps);

  return {
    first_night_character_order_by_id: build_character_order_map(first_night_steps),
    other_night_character_order_by_id: build_character_order_map(other_night_steps),
    first_night_special_order_by_number:
      first_night_special_order_by_number.length > 0
        ? first_night_special_order_by_number
        : ['minioninfo', 'demoninfo']
  };
}

const NIGHT_ORDER = load_night_order();

export const FIRST_NIGHT_ORDER_BY_CHARACTER_ID = NIGHT_ORDER.first_night_character_order_by_id;

export const OTHER_NIGHT_ORDER_BY_CHARACTER_ID = NIGHT_ORDER.other_night_character_order_by_id;

export const FIRST_NIGHT_SPECIAL_ORDER_BY_NUMBER = NIGHT_ORDER.first_night_special_order_by_number;
