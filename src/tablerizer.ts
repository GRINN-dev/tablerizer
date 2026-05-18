/**
 * Tablerizer public API — Effect-TS version
 *
 * CONCEPT — La classe disparaît. Pourquoi ?
 *
 * L'ancien Tablerizer avait connect() / disconnect() / export().
 * La classe existait pour gérer le cycle de vie de la connexion.
 *
 * Avec Effect :
 *   • Le cycle de vie → géré par Layer + acquireRelease (database.ts)
 *   • La config → passée en paramètre (pas de state mutable)
 *   • Les méthodes → deviennent des fonctions qui retournent des Effects
 *
 * Résultat : plus de classe, plus de this, plus de null checks.
 * Juste des fonctions composables.
 */

import { Effect, pipe } from "effect"
import type { TablerizerOptions } from "./config.js"
import { validateConfig, normalizeScope, type ConfigValidationError } from "./config.js"
import { type DatabaseConnection, type DatabaseError, BunSQLConnectionLive } from "./database.js"
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
// Chaque fonction retourne un Effect avec :
//   A = le résultat
//   E = les erreurs possibles (union de toutes les erreurs des couches)
//   R = DatabaseConnection (fourni par un Layer)
//
// Remarque comment les erreurs s'ACCUMULENT :
//   validateConfig    → ConfigValidationError
//   scan/scanTable    → DatabaseError | ScanError
//   writeSnapshots    → WriteError
//
// Le type final est l'UNION de toutes ces erreurs.
// Le compilateur te force à toutes les gérer.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const exportAll = (
  options: TablerizerOptions,
  progressCallback?: ProgressCallback,
): Effect.Effect<
  ExportResult,
  ConfigValidationError | DatabaseError | ScanError | WriteError,
  DatabaseConnection
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
): Effect.Effect<string, ConfigValidationError | DatabaseError | ScanError, DatabaseConnection> =>
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
): Effect.Effect<string, ConfigValidationError | DatabaseError | ScanError, DatabaseConnection> =>
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
// Pour les utilisateurs qui veulent une API simple (Promise),
// on fournit un helper qui :
//   1. Crée le Layer avec la connection string
//   2. Le fournit au programme (Effect.provide)
//   3. Exécute le tout (Effect.runPromise)
//
// C'est la FRONTIÈRE entre le monde Effect et le monde "normal".
// À l'intérieur : tout est Effect, typé, composable.
// À l'extérieur : juste une Promise, comme avant.
//
// Effect.provide élimine le R du type :
//   Effect<A, E, DatabaseConnection>
//     → Effect.provide(layer)
//   Effect<A, E, never>  ← plus de requirement !
//
// Effect.runPromise transforme Effect en Promise :
//   Effect<A, E, never> → Promise<A>
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
      Effect.provide(BunSQLConnectionLive(dbUrl)),
    ),
  )
}
