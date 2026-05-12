/**
 * Configuration management for Tablerizer
 */

import fs from "fs";
import path from "path";

export interface Config {
  schemas?: string[];
  out?: string;
  roles?: string[];
  database_url?: string;
  role_mappings?: Record<string, string>;
  scope?: ExportScope | ExportScope[];
  include_date?: boolean;
  clean?: boolean;
  silent?: boolean;
}

export type ExportScope =
  | "tables"
  | "functions"
  | "views"
  | "materialized-views"
  | "all";

export interface TablerizerOptions {
  schemas: string[];
  out?: string;
  roles?: string[];
  database_url?: string;
  role_mappings?: Record<string, string>;
  scope?: ExportScope | ExportScope[];
  include_date?: boolean;
  clean?: boolean;
  silent?: boolean;
}

export interface CliArgs {
  schemas: string[];
  out?: string;
  roles?: string[];
  database_url?: string;
  role_mappings: Record<string, string>;
  scope?: ExportScope | ExportScope[];
  clean?: boolean;
  include_date?: boolean;
  silent?: boolean;
}

/**
 * Find configuration file in current directory
 */
export function findConfigFile(): string | null {
  const possibleConfigs = [".tablerizerrc", ".tablerizerrc.json"];

  for (const configName of possibleConfigs) {
    const configPath = path.resolve(process.cwd(), configName);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * Expand environment variables in a string value
 * Supports: $VAR, ${VAR}, ${VAR:default}
 */
function expandEnvVars(value: string): string {
  return value.replace(
    /\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g,
    (match, braced, simple) => {
      const varName = braced || simple;

      // Handle default value syntax: ${VAR:default}
      if (braced && braced.includes(":")) {
        const [envVar, defaultValue] = braced.split(":", 2);
        return process.env[envVar] || defaultValue;
      }

      // Simple variable expansion
      return process.env[varName] || match;
    }
  );
}

/**
 * Recursively expand environment variables in config object
 * Special handling for role_mappings to expand variables in keys
 */
function expandConfigEnvVars(obj: any, parentKey?: string): any {
  if (typeof obj === "string") {
    return expandEnvVars(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => expandConfigEnvVars(item));
  }

  if (obj && typeof obj === "object") {
    const expanded: any = {};
    
    // Special handling for role_mappings: expand env vars in both keys and values
    if (parentKey === "role_mappings") {
      for (const [key, value] of Object.entries(obj)) {
        const expandedKey = expandEnvVars(key);
        const expandedValue = expandConfigEnvVars(value);
        expanded[expandedKey] = expandedValue;
      }
    } else {
      for (const [key, value] of Object.entries(obj)) {
        expanded[key] = expandConfigEnvVars(value, key);
      }
    }
    return expanded;
  }

  return obj;
}

/**
 * Load and parse configuration file with environment variable expansion
 */
export function loadConfig(configPath: string): Config {
  try {
    const configContent = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(configContent);

    // Expand environment variables in the config
    const expandedConfig = expandConfigEnvVars(config);

    return expandedConfig;
  } catch (error) {
    throw new Error(`Failed to load config file ${configPath}: ${error}`);
  }
}

export interface ConfigLayers {
  file?: Partial<TablerizerOptions>;
  env?: Partial<TablerizerOptions>;
  cli?: Partial<TablerizerOptions>;
}

/**
 * Resolve configuration by merging layers with explicit precedence:
 * defaults < file < env < cli
 */
export function resolveConfig(layers: ConfigLayers): TablerizerOptions {
  const defaults = getDefaultConfig();
  const file = layers.file ?? {};
  const env = layers.env ?? {};
  const cli = layers.cli ?? {};

  return {
    schemas: first([cli.schemas, env.schemas, file.schemas, defaults.schemas], isNonEmptyArray) ?? [],
    out: cli.out ?? env.out ?? file.out ?? defaults.out,
    roles: cli.roles ?? env.roles ?? file.roles ?? defaults.roles,
    database_url: cli.database_url ?? env.database_url ?? file.database_url ?? defaults.database_url,
    role_mappings: { ...defaults.role_mappings, ...file.role_mappings, ...env.role_mappings, ...cli.role_mappings },
    scope: cli.scope ?? env.scope ?? file.scope ?? defaults.scope,
    include_date: cli.include_date ?? env.include_date ?? file.include_date ?? defaults.include_date,
    clean: cli.clean ?? env.clean ?? file.clean ?? defaults.clean,
    silent: cli.silent ?? env.silent ?? file.silent ?? defaults.silent,
  };
}

function first<T>(candidates: (T | undefined)[], predicate: (v: T) => boolean): T | undefined {
  for (const c of candidates) {
    if (c !== undefined && predicate(c)) return c;
  }
  return undefined;
}

function isNonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

/**
 * Validate configuration options
 */
export function validateConfig(config: TablerizerOptions): void {
  if (!config.schemas || config.schemas.length === 0) {
    throw new Error("At least one schema must be specified");
  }

  if (!config.database_url) {
    throw new Error("Database URL must be provided");
  }

  // Validate schema names (basic validation)
  for (const schema of config.schemas) {
    if (!schema || schema.trim().length === 0) {
      throw new Error("Schema names cannot be empty");
    }
  }
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): TablerizerOptions {
  return {
    schemas: [],
    out: "./tables",
    roles: undefined,
    database_url: undefined,
    role_mappings: {},
    scope: "all",
    include_date: false, // Default: no date in headers
    clean: true, // Default: clean output directory before export
    silent: false, // Default: verbose output
  };
}

/**
 * Merge configurations (used for library usage)
 */
export function mergeConfigs(
  base: Partial<TablerizerOptions>,
  override: Partial<TablerizerOptions>
): TablerizerOptions {
  return {
    schemas: override.schemas || base.schemas || [],
    out: override.out || base.out || "./tables",
    roles: override.roles || base.roles,
    database_url: override.database_url || base.database_url,
    role_mappings: { ...base.role_mappings, ...override.role_mappings },
    scope: override.scope || base.scope || "all",
    include_date:
      override.include_date !== undefined
        ? override.include_date
        : base.include_date ?? false,
    clean: override.clean !== undefined ? override.clean : base.clean ?? true, // Default: clean output directory
    silent:
      override.silent !== undefined ? override.silent : base.silent ?? false, // Default: verbose output
  };
}
