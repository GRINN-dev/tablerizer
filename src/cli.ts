/**
 * CLI for Tablerizer — Effect-TS version
 *
 * CONCEPTS EFFECT INTRODUITS :
 *   1. Effect.provide   → fournir un Layer, éliminer le R du type
 *   2. Effect.catchTag  → gérer une erreur spécifique par son _tag
 *   3. Effect.catchAll  → attraper toutes les erreurs restantes
 *   4. Effect.runPromise → la frontière Effect → monde réel
 */

import { Effect, pipe } from "effect"
import { readFileSync } from "fs"
import {
  parseCliArgs,
  parseEnvVars,
  parseConfigFile,
  resolveConfig,
  validateConfig,
  findConfigFile,
  ConfigParseError,
  type TablerizerOptions,
  type ConfigValidationError,
  type ConfigFileNotFound,
} from "./config.js"
import { BunSQLConnectionLive, type DatabaseError } from "./database.js"
import { exportAll, type ExportResult, type ProgressCallback } from "./tablerizer.js"
import type { ScanError } from "./scanner.js"
import type { WriteError } from "./writer.js"

const TOOL_NAME = "tablerizer"
const VERSION = "2.0.0"

const ASCII_ART = `
████████╗ █████╗ ██████╗ ██╗     ███████╗██████╗ ██╗███████╗███████╗██████╗
╚══██╔══╝██╔══██╗██╔══██╗██║     ██╔════╝██╔══██╗██║╚══███╔╝██╔════╝██╔══██╗
   ██║   ███████║██████╔╝██║     █████╗  ██████╔╝██║  ███╔╝ █████╗  ██████╔╝
   ██║   ██╔══██║██╔══██╗██║     ██╔══╝  ██╔══██╗██║ ███╔╝  ██╔══╝  ██╔══██╗
   ██║   ██║  ██║██████╔╝███████╗███████╗██║  ██║██║███████╗███████╗██║  ██║
   ╚═╝   ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝  ╚═╝

🧙‍♂️ The PostgreSQL Table Export Wizard 🧙‍♂️
`

export function showBanner(): void {
  console.log(ASCII_ART)
}

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
  --scope <type>      🎯 Export scope: tables, functions, views, materialized-views, or all (default: all)
  --include-date      📅 Include generation date in file headers
  --no-date          🚫 Exclude date from headers (default)
  --clean            🧹 Clean output directory before export (default)
  --no-clean         🚫 Keep existing files in output directory
  --silent           🤫 Silent mode - minimal output for automation
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
    "clean": true,
    "silent": false,
    "role_mappings": {
      "actual_role": ":PLACEHOLDER_ROLE"
    }
  }

ENVIRONMENT ENCHANTMENTS:
  DATABASE_URL       🔌 PostgreSQL connection string
  SCHEMAS           🎯 Comma-separated schema names
  OUTPUT_DIR        📁 Output directory path
  ROLES             🔐 Comma-separated role names

For more wizardry: https://github.com/your-repo/tablerizer
`)
}

export function showVersion(): void {
  console.log(`🎲 ${TOOL_NAME} v${VERSION} - The PostgreSQL Table Export Wizard!`)
}

function getConfigPath(args: string[]): string | undefined {
  const idx = args.indexOf("--config")
  return idx !== -1 ? args[idx + 1] : undefined
}

export function displayConfigSummary(config: {
  schemas: string[]
  out?: string
  roles?: string[]
  role_mappings?: Record<string, string>
  scope?: string | string[]
  silent?: boolean
}): void {
  if (config.silent) {
    console.log(`Exporting ${config.schemas.join(",")} to ${config.out || "./tables"}`)
    return
  }
  console.log(`📂 Conjuring files in: ${config.out || "./tables"}`)
  console.log(`🎯 Target schemas: ${config.schemas.join(", ")}`)
  console.log(`📊 Export scope: ${Array.isArray(config.scope) ? config.scope.join(", ") : config.scope || "all"}`)
  if (config.roles && config.roles.length > 0) {
    console.log(`🔐 Filtering for roles: ${config.roles.join(", ")}`)
  } else {
    console.log(`🔐 Including all roles (full power!)`)
  }
  if (config.role_mappings && Object.keys(config.role_mappings).length > 0) {
    console.log(`🎭 Role transformation spells:`)
    for (const [from, to] of Object.entries(config.role_mappings)) {
      console.log(`   ✨ ${from} → ${to}`)
    }
  }
}

export function displayCompletionSummary(summary: {
  schemas: string[]
  totalFiles: number
  tableFiles?: number
  functionFiles?: number
  outputPath: string
  roleMappings?: Record<string, string>
  silent?: boolean
}): void {
  if (summary.silent) {
    console.log(`Complete: ${summary.totalFiles} files exported to ${summary.outputPath}`)
    return
  }
  console.log(`🏆 Export wizard complete!`)
  console.log(`📊 Summary:`)
  console.log(`   • Schemas processed: ${summary.schemas.length}`)
  console.log(`   • Total files created: ${summary.totalFiles}`)
  if (summary.tableFiles !== undefined) console.log(`   • Table files: ${summary.tableFiles}`)
  if (summary.functionFiles !== undefined) console.log(`   • Function files: ${summary.functionFiles}`)
  console.log(`   • Output location: ${summary.outputPath}`)
  if (summary.roleMappings && Object.keys(summary.roleMappings).length > 0) {
    console.log(`   • Role transformation spells: ${Object.keys(summary.roleMappings).length} applied`)
  }
  console.log(`\n✨ Your database spells are ready! ✨\n`)
}

export function displayError(message: string): void {
  console.error(`💥 Spell failed: ${message}`)
}

export function displayConnectionStatus(connecting: boolean, silent?: boolean): void {
  if (silent) {
    console.log(connecting ? `Connecting...` : `Connected.`)
    return
  }
  if (connecting) {
    console.log(`🔮 Connecting to database...`)
  } else {
    console.log(`✨ Connected successfully! The magic begins...\n`)
  }
}

export function displayProcessingStatus(silent?: boolean): void {
  if (silent) {
    console.log(`Processing...`)
    return
  }
  console.log(`\n🚀 The table export wizard is working...\n`)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHARGEMENT DE LA CONFIG (composition d'Effects)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CONCEPT — Effect.catchTag
//
// Gère UNE erreur spécifique par son _tag, sans toucher aux autres.
//
//   pipe(
//     findConfigFile,                              // Effect<string, ConfigFileNotFound>
//     Effect.catchTag("ConfigFileNotFound", () =>   // attrape JUSTE ConfigFileNotFound
//       Effect.succeed(undefined)                   // → pas de fichier, c'est OK
//     )
//   )
//   // Résultat : Effect<string | undefined, never>
//   //                                       ^^^^^
//   //            l'erreur a été RETIRÉE du type !
//
// C'est comme un catch sélectif : on traite ConfigFileNotFound
// mais on laisse passer ConfigParseError (qui est une vraie erreur).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const loadConfig = (
  args: string[],
): Effect.Effect<TablerizerOptions, ConfigParseError | ConfigValidationError> =>
  Effect.gen(function* () {
    const configPath = getConfigPath(args)

    // Charger le fichier de config (ou {} si pas trouvé)
    const fileConfig = yield* pipe(
      // Si --config est spécifié, utiliser ce chemin
      // Sinon, chercher .tablerizerrc (peut échouer avec ConfigFileNotFound)
      configPath
        ? Effect.succeed(configPath)
        : findConfigFile,
      // Lire et parser le fichier
      Effect.flatMap((filePath) =>
        pipe(
          Effect.try({
            try: () => readFileSync(filePath, "utf8"),
            catch: (cause) =>
              new ConfigParseError({
                message: `Cannot read ${filePath}: ${cause}`,
                cause,
              }),
          }),
          Effect.flatMap((content) => parseConfigFile(content)),
        ),
      ),
      // Si pas de fichier trouvé → utiliser un objet vide (c'est normal)
      Effect.catchTag("ConfigFileNotFound", () =>
        Effect.succeed({} as Partial<TablerizerOptions>),
      ),
    )

    // Fusionner les couches : file < env < cli
    const config = resolveConfig({
      file: fileConfig,
      env: parseEnvVars(process.env),
      cli: parseCliArgs(args),
    })

    // Valider la config finale
    return yield* validateConfig(config)
  })

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROGRAMME PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CONCEPT — Effect.provide
//
// Effect.provide(layer) FOURNIT un service et RETIRE le
// requirement du type :
//
//   exportAll(config)
//     → Effect<ExportResult, ..., DatabaseConnection>
//                                  ^^^^^^^^^^^^^^^^^^
//
//   pipe(exportAll(config), Effect.provide(BunSQLConnectionLive(url)))
//     → Effect<ExportResult, ..., never>
//                                 ^^^^^
//                                 requirement satisfait !
//
// C'est le moment où la "recette" (Layer) est connectée au
// "programme" (Effect). Le Layer gère connect/disconnect
// automatiquement via acquireRelease.
//
// CONCEPT — Effect.runPromise
//
// La FRONTIÈRE entre Effect et le monde "normal".
// Transforme un Effect<A, E, never> en Promise<A>.
//
// runPromise ne peut être appelé que sur un Effect sans requirements
// (R = never). Si tu oublies un Effect.provide, ça ne compile pas.
//
// C'est LE point d'entrée unique. Tout le reste du programme est
// pur Effect, composable, testable, typé.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const cliProgram: Effect.Effect<void, never> = pipe(
  Effect.gen(function* () {
    const args = process.argv.slice(2)

    if (args.includes("--help") || args.includes("-h")) {
      showHelp()
      return
    }
    if (args.includes("--version") || args.includes("-v")) {
      showVersion()
      return
    }

    const config = yield* loadConfig(args)

    if (!config.silent) showBanner()
    displayConfigSummary(config)
    displayConnectionStatus(true, config.silent)

    // exportAll a besoin de DatabaseConnection.
    // Effect.provide(BunSQLConnectionLive(...)) fournit ce service.
    // La connexion est créée par le Layer (acquireRelease),
    // utilisée pendant l'export, puis fermée automatiquement.
    const result = yield* pipe(
      exportAll(config, (progress) => {
        if (!config.silent) {
          const pct = Math.round((progress.progress / progress.total) * 100)
          console.log(`    ✨ ${progress.schema}.${progress.table} (${progress.progress}/${progress.total} - ${pct}%)`)
        }
      }),
      Effect.provide(BunSQLConnectionLive(config.database_url!)),
    )

    displayConnectionStatus(false, config.silent)
    displayCompletionSummary({
      schemas: result.schemas,
      totalFiles: result.totalFiles,
      tableFiles: result.tableFiles,
      functionFiles: result.functionFiles,
      outputPath: result.outputPath,
      roleMappings: config.role_mappings,
      silent: config.silent,
    })
  }),
  // ── Gestion des erreurs ──
  //
  // CONCEPT — Effect.catchTags
  //
  // Gère CHAQUE type d'erreur séparément par son _tag.
  // Si tu en oublies un → erreur de compilation.
  // C'est l'exhaustive error handling, garanti par le compilateur.
  Effect.catchTags({
    ConfigValidationError: (e) =>
      Effect.sync(() => {
        displayError(e.issues.join("; "))
        process.exit(1)
      }),
    ConfigParseError: (e) =>
      Effect.sync(() => {
        displayError(`Configuration error: ${e.message}`)
        process.exit(1)
      }),
    DatabaseError: (e) =>
      Effect.sync(() => {
        displayError(`Database error: ${e.message}`)
        process.exit(1)
      }),
    ScanError: (e) =>
      Effect.sync(() => {
        displayError(e.message)
        process.exit(1)
      }),
    WriteError: (e) =>
      Effect.sync(() => {
        displayError(`Failed to write ${e.filePath}`)
        process.exit(1)
      }),
  }),
)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POINT D'ENTRÉE — la frontière Effect → monde réel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function runCLI(): Promise<void> {
  return Effect.runPromise(cliProgram)
}
