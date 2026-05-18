/**
 * Export pipeline orchestrator — Effect-TS version
 *
 * Ce fichier compose les couches : scanner → generators → writer.
 * Il montre comment un programme Effect "grandit" naturellement :
 * les Requirements et les Errors se propagent dans la composition.
 */

import { Effect, pipe } from "effect"
import fs from "fs/promises"
import path from "path"
import type { ExportScope } from "./config.js"
import type { ExportResult, ExportProgress, ProgressCallback } from "./tablerizer.js"
import { DatabaseConnection, DatabaseError } from "./database.js"
import { ScanError, scan } from "./scanner.js"
import { generateTableSQL, generateFunctionSQL, generateMaterializedViewSQL, applyRoleMappings } from "./generators/index.js"
import { writeSnapshots, WriteError } from "./writer.js"

export interface ExportPipelineOptions {
  schemas: string[]
  scope: ExportScope[]
  out: string
  clean: boolean
  roles?: string[]
  role_mappings?: Record<string, string>
  include_date?: boolean
  progressCallback?: ProgressCallback
}

const OBJECT_TYPE_DIR: Record<string, string> = {
  "table": "tables",
  "function": "functions",
  "materialized-view": "materialized-views",
}

export const runExport = (
  options: ExportPipelineOptions,
): Effect.Effect<ExportResult, DatabaseError | ScanError | WriteError, DatabaseConnection> =>
  Effect.gen(function* () {
    const baseOutputDir = options.out

    // Clean output directory (ignore errors — dir might not exist)
    if (options.clean) {
      yield* pipe(
        Effect.tryPromise({
          try: () => fs.rm(baseOutputDir, { recursive: true, force: true }),
          catch: (cause) => new WriteError({ filePath: baseOutputDir, cause }),
        }),
        Effect.catchAll(() => Effect.void),
      )
    }

    yield* Effect.tryPromise({
      try: () => fs.mkdir(baseOutputDir, { recursive: true }),
      catch: (cause) => new WriteError({ filePath: baseOutputDir, cause }),
    })

    // Phase 1 : scan → on obtient tous les objets à exporter
    // scan() a besoin de DatabaseConnection → le requirement se propage ici
    const descriptors = yield* scan(options.schemas, options.scope, options.roles)

    // Phase 2 : generate + write
    // On garde une boucle impérative ici — c'est OK dans Effect.gen.
    // La mutation est locale et contenue, comme dans une async function.
    const files: ExportResult["files"] = []
    let tableFiles = 0
    let functionFiles = 0
    let materializedViewFiles = 0

    for (let i = 0; i < descriptors.length; i++) {
      const descriptor = descriptors[i]

      if (options.progressCallback) {
        options.progressCallback({
          schema: descriptor.schema,
          table: descriptor.name,
          progress: i + 1,
          total: descriptors.length,
        })
      }

      let sql: string
      switch (descriptor.objectType) {
        case "table":
          sql = generateTableSQL(descriptor.schema, descriptor.data, options.include_date)
          break
        case "function":
          sql = generateFunctionSQL(descriptor.data, options.include_date)
          break
        case "materialized-view":
          sql = generateMaterializedViewSQL(descriptor.data, options.include_date)
          break
      }

      if (options.role_mappings && Object.keys(options.role_mappings).length > 0) {
        sql = applyRoleMappings(sql, options.role_mappings)
      }

      const dir = OBJECT_TYPE_DIR[descriptor.objectType]
      let fileName = `${descriptor.name}.sql`
      let filePath = path.join(baseOutputDir, descriptor.schema, dir, fileName)

      let counter = 1
      while (files.some((f) => f.filePath === filePath)) {
        fileName = `${descriptor.name}_${counter}.sql`
        filePath = path.join(baseOutputDir, descriptor.schema, dir, fileName)
        counter++
      }

      // writeSnapshots peut échouer avec WriteError
      // → l'erreur se propage dans le type de runExport
      yield* writeSnapshots([{ filePath, content: sql }])

      files.push({
        schema: descriptor.schema,
        name: descriptor.name,
        type: descriptor.objectType,
        filePath,
        size: sql.length,
      })

      switch (descriptor.objectType) {
        case "table": tableFiles++; break
        case "function": functionFiles++; break
        case "materialized-view": materializedViewFiles++; break
      }
    }

    return {
      schemas: options.schemas,
      totalFiles: files.length,
      tableFiles,
      functionFiles,
      materializedViewFiles,
      outputPath: path.resolve(baseOutputDir),
      files,
    }
  })
