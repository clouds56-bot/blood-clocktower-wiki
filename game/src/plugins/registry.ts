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

function clone_metadata(metadata: CharacterPluginMetadata): CharacterPluginMetadata {
  return {
    ...metadata,
    target_constraints: { ...metadata.target_constraints },
    flags: { ...metadata.flags }
  };
}

function clone_plugin(plugin: CharacterPlugin): CharacterPlugin {
  return {
    metadata: clone_metadata(plugin.metadata),
    hooks: { ...plugin.hooks }
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

    this.plugins_by_id.set(id, clone_plugin(plugin));
    return {
      ok: true,
      value: undefined
    };
  }

  has(character_id: string): boolean {
    return this.plugins_by_id.has(character_id);
  }

  get(character_id: string): CharacterPlugin | null {
    const plugin = this.plugins_by_id.get(character_id);
    return plugin ? clone_plugin(plugin) : null;
  }

  list(): CharacterPluginMetadata[] {
    return [...this.plugins_by_id.values()]
      .map((plugin) => clone_metadata(plugin.metadata))
      .sort((left, right) => {
        if (left.id < right.id) {
          return -1;
        }
        if (left.id > right.id) {
          return 1;
        }
        return 0;
      });
  }
}

export function createPluginRegistry(
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

  const displayId = plugin_id.trim().length > 0 ? plugin_id.trim() : '<unknown>';
  return `plugin ${displayId} metadata invalid: ${issue_text}`;
}
