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
}

export type ExportScope = "tables" | "functions" | "all";

export interface TablerizerOptions {
  schemas: string[];
  out?: string;
  roles?: string[];
  database_url?: string;
  role_mappings?: Record<string, string>;
  scope?: ExportScope | ExportScope[];
}

export interface CliArgs {
  schemas: string[];
  out?: string;
  roles?: string[];
  database_url?: string;
  role_mappings: Record<string, string>;
  scope?: ExportScope | ExportScope[];
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
 * Load and parse configuration file
 */
export function loadConfig(configPath: string): Config {
  try {
    const configContent = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(configContent);
    return config;
  } catch (error) {
    throw new Error(`Failed to load config file ${configPath}: ${error}`);
  }
}

/**
 * Resolve configuration from multiple sources with precedence:
 * 1. CLI arguments (highest)
 * 2. Environment variables
 * 3. Configuration file (lowest)
 */
export function resolveConfig(
  cliArgs: Partial<CliArgs> = {},
  configPath?: string
): TablerizerOptions {
  let config: Config = {};

  // Load config file if provided or found automatically
  const actualConfigPath = configPath || findConfigFile();
  if (actualConfigPath) {
    config = loadConfig(actualConfigPath);
  }

  // Start with config file values
  const resolved: TablerizerOptions = {
    schemas: config.schemas || [],
    out: config.out,
    roles: config.roles,
    database_url: config.database_url,
    role_mappings: config.role_mappings || {},
    scope: config.scope || "all",
  };

  // Override with environment variables
  if (process.env.SCHEMAS && resolved.schemas.length === 0) {
    resolved.schemas = process.env.SCHEMAS.split(",").map((s) => s.trim());
  }
  if (process.env.OUTPUT_DIR && !resolved.out) {
    resolved.out = process.env.OUTPUT_DIR;
  }
  if (process.env.ROLES && !resolved.roles) {
    resolved.roles = process.env.ROLES.split(",").map((r) => r.trim());
  }
  if (process.env.DATABASE_URL && !resolved.database_url) {
    resolved.database_url = process.env.DATABASE_URL;
  }

  // Override with CLI arguments (highest precedence)
  if (cliArgs.schemas && cliArgs.schemas.length > 0) {
    resolved.schemas = cliArgs.schemas;
  }
  if (cliArgs.out) {
    resolved.out = cliArgs.out;
  }
  if (cliArgs.roles) {
    resolved.roles = cliArgs.roles;
  }
  if (cliArgs.database_url) {
    resolved.database_url = cliArgs.database_url;
  }
  if (cliArgs.role_mappings && Object.keys(cliArgs.role_mappings).length > 0) {
    resolved.role_mappings = {
      ...resolved.role_mappings,
      ...cliArgs.role_mappings,
    };
  }
  if (cliArgs.scope) {
    resolved.scope = cliArgs.scope;
  }

  return resolved;
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
  };
}
