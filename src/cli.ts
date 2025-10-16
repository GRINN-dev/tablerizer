/**
 * Command-line interface for Tablerizer
 */

import type { CliArgs } from "./config.js";

const TOOL_NAME = "tablerizer";
const VERSION = "1.1.0";

// ASCII Art for the tool
const ASCII_ART = `
████████╗ █████╗ ██████╗ ██╗     ███████╗██████╗ ██╗███████╗███████╗██████╗ 
╚══██╔══╝██╔══██╗██╔══██╗██║     ██╔════╝██╔══██╗██║╚══███╔╝██╔════╝██╔══██╗
   ██║   ███████║██████╔╝██║     █████╗  ██████╔╝██║  ███╔╝ █████╗  ██████╔╝
   ██║   ██╔══██║██╔══██╗██║     ██╔══╝  ██╔══██╗██║ ███╔╝  ██╔══╝  ██╔══██╗
   ██║   ██║  ██║██████╔╝███████╗███████╗██║  ██║██║███████╗███████╗██║  ██║
   ╚═╝   ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝  ╚═╝

🧙‍♂️ The PostgreSQL Table Export Wizard 🧙‍♂️
`;

/**
 * Show ASCII art banner
 */
export function showBanner(): void {
  console.log(ASCII_ART);
}

/**
 * Show help information
 */
export function showHelp(): void {
  console.log(`
🎲 ${TOOL_NAME} v${VERSION} - The PostgreSQL Table Export Wizard!

Generate SQL files to recreate RBAC (table privileges), RLS (policies), triggers,
constraints, and comprehensive schema documentation for all your tables.

USAGE:
  ${TOOL_NAME} [options]
  ${TOOL_NAME} --schemas "schema1,schema2" --out ./sql_output
  ${TOOL_NAME} --config ./config.json
  ${TOOL_NAME} (uses .tablerizerrc if present)

SPELLBOOK (OPTIONS):
  --config <file>     📜 Path to configuration grimoire (JSON)
  --schemas <list>    🎯 Target schema realms, comma-separated
  --out <directory>   📁 Output sanctum (default: ./tables/)
  --roles <list>      🔐 Filter by magical roles, comma-separated
  --scope <type>      🎯 Export scope: tables, functions, or all (default: all)
  --help, -h         ❓ Show this magical help
  --version, -v      ℹ️  Show version of the wizard

CONFIGURATION SCROLLS:
  Create .tablerizerrc (auto-detected) or custom JSON:
  {
    "schemas": ["app_public", "app_private"],
    "out": "./exports",
    "roles": ["admin", "user"],
    "database_url": "postgres://user:pass@host:5432/db",
    "scope": "all",
    "role_mappings": {
      "actual_role": ":PLACEHOLDER_ROLE"
    }
  }

ENVIRONMENT ENCHANTMENTS:
  DATABASE_URL       🔌 PostgreSQL connection string
  SCHEMAS           🎯 Comma-separated schema names
  OUTPUT_DIR        📁 Output directory path
  ROLES             🔐 Comma-separated role names

MAGIC FEATURES:
  🎲 Role Mappings    - Replace roles with placeholders for Graphile Migrate
  📋 Rich Documentation - Table schema, foreign keys, constraints, comments  
  🧹 Idempotent Scripts - Safe cleanup and recreation sections
  ⚡ Multi-Schema Export - Organized folder structure
  🔮 Function Export - Export stored procedures and functions with GRANT EXECUTE
  📊 Flexible Scope - Export tables, functions, or both

For more wizardry: https://github.com/your-repo/tablerizer
`);
}

/**
 * Show version information
 */
export function showVersion(): void {
  console.log(
    `🎲 ${TOOL_NAME} v${VERSION} - The PostgreSQL Table Export Wizard!`
  );
}

/**
 * Parse command line arguments
 */
export function parseCliArgs(): Partial<CliArgs> {
  const args = process.argv.slice(2);
  const result: Partial<CliArgs> = {
    role_mappings: {},
  };

  // Check for help or version first
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    showVersion();
    process.exit(0);
  }

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--schema":
        // Legacy support for single schema
        result.schemas = [next];
        i++;
        break;
      case "--schemas":
        result.schemas = next.split(",").map((s) => s.trim());
        i++;
        break;
      case "--out":
        result.out = next;
        i++;
        break;
      case "--role":
      case "--roles":
        result.roles = next.split(",").map((r) => r.trim());
        i++;
        break;
      case "--database-url":
        result.database_url = next;
        i++;
        break;
      case "--scope":
        if (next === "tables" || next === "functions" || next === "all") {
          result.scope = next;
        } else {
          console.error("❌ Invalid scope. Must be: tables, functions, or all");
          process.exit(1);
        }
        i++;
        break;
      case "--config":
        // Config file path is handled separately
        i++;
        break;
    }
  }

  return result;
}

/**
 * Get config file path from CLI args
 */
export function getConfigPath(): string | undefined {
  const args = process.argv.slice(2);
  const configIndex = args.indexOf("--config");

  if (configIndex !== -1 && args[configIndex + 1]) {
    return args[configIndex + 1];
  }

  return undefined;
}

/**
 * Display configuration summary
 */
export function displayConfigSummary(config: {
  schemas: string[];
  out?: string;
  roles?: string[];
  role_mappings?: Record<string, string>;
  scope?: string | string[];
}): void {
  console.log(`📂 Conjuring files in: ${config.out || "./tables"}`);
  console.log(`🎯 Target schemas: ${config.schemas.join(", ")}`);
  console.log(
    `📊 Export scope: ${
      Array.isArray(config.scope)
        ? config.scope.join(", ")
        : config.scope || "all"
    }`
  );

  if (config.roles && config.roles.length > 0) {
    console.log(`🔐 Filtering for roles: ${config.roles.join(", ")}`);
  } else {
    console.log(`🔐 Including all roles (full power!)`);
  }

  if (config.role_mappings && Object.keys(config.role_mappings).length > 0) {
    console.log(`🎭 Role transformation spells:`);
    for (const [from, to] of Object.entries(config.role_mappings)) {
      console.log(`   ✨ ${from} → ${to}`);
    }
  }
}

/**
 * Display completion summary
 */
export function displayCompletionSummary(summary: {
  schemas: string[];
  totalFiles: number;
  tableFiles?: number;
  functionFiles?: number;
  outputPath: string;
  roleMappings?: Record<string, string>;
}): void {
  console.log(`🏆 Export wizard complete!`);
  console.log(`📊 Summary:`);
  console.log(`   • Schemas processed: ${summary.schemas.length}`);
  console.log(`   • Total files created: ${summary.totalFiles}`);

  if (summary.tableFiles !== undefined) {
    console.log(`   • Table files: ${summary.tableFiles}`);
  }
  if (summary.functionFiles !== undefined) {
    console.log(`   • Function files: ${summary.functionFiles}`);
  }

  console.log(`   • Output location: ${summary.outputPath}`);

  if (summary.roleMappings && Object.keys(summary.roleMappings).length > 0) {
    console.log(
      `   • Role transformation spells: ${
        Object.keys(summary.roleMappings).length
      } applied`
    );
  }

  console.log(`\\n✨ Your database spells are ready! ✨\\n`);
}

/**
 * Display error message with wizard theme
 */
export function displayError(message: string): void {
  console.error(`💥 Spell failed: ${message}`);
}

/**
 * Display connection status
 */
export function displayConnectionStatus(connecting: boolean): void {
  if (connecting) {
    console.log(`🔮 Connecting to database...`);
  } else {
    console.log(`✨ Connected successfully! The magic begins...\\n`);
  }
}

/**
 * Display processing status
 */
export function displayProcessingStatus(): void {
  console.log(`\\n🚀 The table export wizard is working...\\n`);
}

/**
 * Main CLI runner function
 */
export async function runCLI(): Promise<void> {
  // Import here to avoid circular dependencies
  const { Tablerizer } = await import("./index.js");
  const { resolveConfig } = await import("./config.js");

  try {
    // Show banner
    showBanner();

    // Parse CLI args
    const cliArgs = parseCliArgs();
    const configPath = getConfigPath();

    // Resolve configuration
    const config = await resolveConfig(cliArgs, configPath);

    // Display configuration summary
    displayConfigSummary(config);
    displayConnectionStatus(true);

    // Create and run tablerizer
    const tablerizer = new Tablerizer(config);
    await tablerizer.connect();

    displayConnectionStatus(false);
    displayProcessingStatus();

    let progressCounter = 0;

    const result = await tablerizer.export((progress) => {
      progressCounter++;
      const percentage = Math.round((progress.progress / progress.total) * 100);
      console.log(
        `    ✨ ${progress.schema}.${progress.table} (${progress.progress}/${progress.total} - ${percentage}%)`
      );
    });

    await tablerizer.disconnect();

    // Display completion summary
    displayCompletionSummary({
      schemas: result.schemas,
      totalFiles: result.totalFiles,
      tableFiles: result.tableFiles,
      functionFiles: result.functionFiles,
      outputPath: result.outputPath,
      roleMappings: config.role_mappings,
    });
  } catch (error) {
    if (error instanceof Error) {
      displayError(error.message);
    } else {
      displayError("Unknown error occurred");
    }
    throw error;
  }
}
