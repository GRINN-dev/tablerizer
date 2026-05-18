/**
 * Tablerizer public API — Effect-TS version
 *
 * CONCEPT — @effect/sql remplace notre couche custom
 *
 * L'ancien code avait :
 *   • DatabaseConnection (notre Context.Tag fait main)
 *   • PostgresConnectionLive (notre Layer fait main)
 *
 * Maintenant :
 *   • SqlClient.SqlClient (le Tag standard de @effect/sql)
 *   • makeDbLayer (wrapper autour de PgClient.layer)
 *
 * Le résultat est identique pour l'utilisateur :
 *   exportAll(options) → Effect qui a besoin de SqlClient
 *   runExportWithConnection(options) → Promise (frontière Effect → monde réel)
 */

import { Effect, pipe } from "effect"
import { SqlClient } from "@effect/sql"
import type { SqlError } from "@effect/sql/SqlError"
import type { TablerizerOptions } from "./config.js"
import { validateConfig, normalizeScope, type ConfigValidationError } from "./config.js"
import { makeDbLayer } from "./database.js"
import { generateTableSQL, generateFunctionSQL, applyRoleMappings } from "./generators/index.js"
import { scanTable, scanFunction, type ScanError } from "./scanner.js"
import { runExport, type ExportPipelineOptions } from "./orchestrator.js"
import type { WriteError } from "./writer.js"

export interface ExportResult {
  schemas: string[]
  totalFiles: number
  outputPath: string
  tableFiles: number
  functionFiles: number
  materializedViewFiles: number
  files: Array<{
    schema: string
    name: string
    type: "table" | "function" | "materialized-view"
    filePath: string
    size: number
  }>
}

export interface ExportProgress {
  schema: string
  table: string
  progress: number
  total: number
}

export type ProgressCallback = (progress: ExportProgress) => void

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API FONCTIONNELLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Le requirement est maintenant SqlClient.SqlClient au lieu de
// DatabaseConnection. C'est le Tag standard — fourni par
// PgClient.layer() (PostgreSQL) ou tout autre driver @effect/sql.
//
// Les erreurs utilisent SqlError (de @effect/sql) au lieu de
// notre ancien DatabaseError custom.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const exportAll = (
  options: TablerizerOptions,
  progressCallback?: ProgressCallback,
): Effect.Effect<
  ExportResult,
  ConfigValidationError | SqlError | ScanError | WriteError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    yield* validateConfig(options)
    const scope = normalizeScope(options.scope)
    return yield* runExport({
      schemas: options.schemas,
      scope,
      out: options.out || "./tables",
      clean: options.clean !== false,
      roles: options.roles,
      role_mappings: options.role_mappings,
      include_date: options.include_date,
      progressCallback,
    })
  })

export const exportTable = (
  schema: string,
  tableName: string,
  options: TablerizerOptions,
): Effect.Effect<string, ConfigValidationError | SqlError | ScanError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    yield* validateConfig(options)
    const data = yield* scanTable(schema, tableName, options.roles)
    let sql = generateTableSQL(schema, data, options.include_date)
    if (options.role_mappings && Object.keys(options.role_mappings).length > 0) {
      sql = applyRoleMappings(sql, options.role_mappings)
    }
    return sql
  })

export const exportFunction = (
  schema: string,
  functionName: string,
  options: TablerizerOptions,
): Effect.Effect<string, ConfigValidationError | SqlError | ScanError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    yield* validateConfig(options)
    const data = yield* scanFunction(schema, functionName, options.roles)
    let sql = generateFunctionSQL(data, options.include_date)
    if (options.role_mappings && Object.keys(options.role_mappings).length > 0) {
      sql = applyRoleMappings(sql, options.role_mappings)
    }
    return sql
  })

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONCEPT — Effect.provide + Effect.runPromise
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// makeDbLayer(url) crée un Layer qui fournit SqlClient.SqlClient.
// Effect.provide(layer) élimine le R du type.
// Effect.runPromise transforme le tout en Promise.
//
// C'est la FRONTIÈRE entre le monde Effect et le monde "normal".
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const runExportWithConnection = (
  options: TablerizerOptions,
  progressCallback?: ProgressCallback,
): Promise<ExportResult> => {
  const dbUrl = options.database_url
  if (!dbUrl) {
    return Promise.reject(new Error("Database URL is required"))
  }
  return Effect.runPromise(
    pipe(
      exportAll(options, progressCallback),
      Effect.provide(makeDbLayer(dbUrl)),
    ),
  )
}
