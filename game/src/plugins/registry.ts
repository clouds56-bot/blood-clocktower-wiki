import type { CharacterPlugin, CharacterPluginMetadata, PluginValidationIssue } from './contracts.js';
import { validate_plugin_metadata } from './contracts.js';

export interface PluginRegistryError {
  code: string;
  message: string;
}

export type PluginRegistryResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: PluginRegistryError;
    };

function error(code: string, message: string): PluginRegistryResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

export class PluginRegistry {
  private readonly plugins_by_id: Map<string, CharacterPlugin>;

  constructor(initial_plugins: CharacterPlugin[] = []) {
    this.plugins_by_id = new Map();
    for (const plugin of initial_plugins) {
      const result = this.register(plugin);
      if (!result.ok) {
        throw new Error(`${result.error.code}:${result.error.message}`);
      }
    }
  }

  register(plugin: CharacterPlugin): PluginRegistryResult<void> {
    const issues = validate_plugin_metadata(plugin.metadata);
    if (issues.length > 0) {
      return error(
        'plugin_metadata_invalid',
        format_validation_issues(plugin.metadata.id, issues)
      );
    }

    const id = plugin.metadata.id;
    if (this.plugins_by_id.has(id)) {
      return error('plugin_already_registered', `plugin ${id} is already registered`);
    }

    this.plugins_by_id.set(id, plugin);
    return {
      ok: true,
      value: undefined
    };
  }

  has(character_id: string): boolean {
    return this.plugins_by_id.has(character_id);
  }

  get(character_id: string): CharacterPlugin | null {
    return this.plugins_by_id.get(character_id) ?? null;
  }

  list(): CharacterPluginMetadata[] {
    return [...this.plugins_by_id.values()]
      .map((plugin) => ({ ...plugin.metadata }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}

export function create_plugin_registry(
  plugins: CharacterPlugin[] = []
): PluginRegistryResult<PluginRegistry> {
  try {
    return {
      ok: true,
      value: new PluginRegistry(plugins)
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unknown plugin registry construction error';
    return error('plugin_registry_init_failed', message);
  }
}

function format_validation_issues(plugin_id: string, issues: PluginValidationIssue[]): string {
  const issue_text = issues
    .map((issue) => `${issue.code}${issue.path ? `(${issue.path})` : ''}: ${issue.message}`)
    .join('; ');

  return `plugin ${plugin_id || '<unknown>'} metadata invalid: ${issue_text}`;
}
