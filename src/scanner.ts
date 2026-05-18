/**
 * Object scanner for Tablerizer — Effect-TS version
 *
 * CONCEPTS EFFECT INTRODUITS :
 *   1. Effect.all       → remplace Promise.all (+ concurrence bornée !)
 *   2. Effect.all({})   → variante avec un record (résultats nommés)
 *   3. Propagation de R → SqlClient.SqlClient se propage automatiquement
 *   4. Union d'erreurs  → E s'unifie automatiquement dans la composition
 */

import { Effect, Data, pipe } from "effect"
import { SqlClient } from "@effect/sql"
import type { SqlError } from "@effect/sql/SqlError"
import { type FunctionInfo, type MaterializedViewInfo, type TableData } from "./database.js"
import type { ExportScope } from "./config.js"
import * as queries from "./queries.js"

// ━━━ Erreur typée ━━━

export class ScanError extends Data.TaggedError("ScanError")<{
  readonly message: string
}> {}

// ━━━ Types de données (inchangés) ━━━

export interface FunctionData {
  info: FunctionInfo
  grantRoles: string[]
}

export interface MaterializedViewData {
  info: MaterializedViewInfo
  grants: Array<{
    grantor: string
    grantee: string
    privilege: string
    is_grantable: boolean
  }>
  indexes: Array<{
    index_name: string
    index_definition: string
  }>
}

export type ObjectDescriptor =
  | { schema: string; name: string; objectType: "table"; data: TableData }
  | { schema: string; name: string; objectType: "function"; data: FunctionData }
  | { schema: string; name: string; objectType: "materialized-view"; data: MaterializedViewData }

const HYDRATION_CONCURRENCY = 2

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// scan — Découvre et hydrate les objets de la base
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Remarque : le requirement est maintenant SqlClient.SqlClient
// au lieu de DatabaseConnection. C'est le Tag standard de
// @effect/sql — il se propage automatiquement depuis queries.ts.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Listing =
  | { schema: string; kind: "tables"; items: ReadonlyArray<{ table_name: string }> }
  | { schema: string; kind: "functions"; items: ReadonlyArray<FunctionInfo> }
  | { schema: string; kind: "matviews"; items: ReadonlyArray<MaterializedViewInfo> }

export const scan = (
  schemas: string[],
  scope: ExportScope[],
  roles?: string[],
): Effect.Effect<ObjectDescriptor[], SqlError | ScanError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    // ── Phase 1 : Lister les objets (tout en parallèle) ──
    const listingEffects = schemas.flatMap((schema) => {
      const effects: Effect.Effect<Listing, SqlError, SqlClient.SqlClient>[] = []
      if (scope.includes("tables")) {
        effects.push(
          pipe(queries.getTables(schema), Effect.map((items) => ({ schema, kind: "tables" as const, items }))),
        )
      }
      if (scope.includes("functions")) {
        effects.push(
          pipe(queries.getFunctions(schema), Effect.map((items) => ({ schema, kind: "functions" as const, items }))),
        )
      }
      if (scope.includes("materialized-views")) {
        effects.push(
          pipe(queries.getMaterializedViews(schema), Effect.map((items) => ({ schema, kind: "matviews" as const, items }))),
        )
      }
      return effects
    })

    const listings = yield* Effect.all(listingEffects, { concurrency: "unbounded" })

    // ── Phase 2 : Hydrater avec concurrence bornée ──
    const hydrationEffects = listings.flatMap(
      (listing): Effect.Effect<ObjectDescriptor, SqlError | ScanError, SqlClient.SqlClient>[] => {
        switch (listing.kind) {
          case "tables":
            return listing.items.map((t) =>
              pipe(
                scanTable(listing.schema, t.table_name, roles),
                Effect.map((data) => ({
                  schema: listing.schema,
                  name: t.table_name,
                  objectType: "table" as const,
                  data,
                })),
              ),
            )
          case "functions":
            return listing.items.map((f) =>
              Effect.succeed({
                schema: listing.schema,
                name: f.function_name,
                objectType: "function" as const,
                data: { info: f, grantRoles: roles ?? [] } satisfies FunctionData,
              }),
            )
          case "matviews":
            return listing.items.map((mv) =>
              pipe(
                Effect.all([
                  queries.getGrants(listing.schema, mv.matview_name, "table", roles),
                  queries.getMaterializedViewIndexes(listing.schema, mv.matview_name),
                ], { concurrency: "unbounded" }),
                Effect.map(([grants, indexes]) => ({
                  schema: listing.schema,
                  name: mv.matview_name,
                  objectType: "materialized-view" as const,
                  data: { info: mv, grants: [...grants], indexes: [...indexes] } satisfies MaterializedViewData,
                })),
              ),
            )
        }
      },
    )

    return yield* Effect.all(hydrationEffects, { concurrency: HYDRATION_CONCURRENCY })
  })

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// scanTable — Hydrate une table avec toutes ses métadonnées
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const scanTable = (
  schema: string,
  tableName: string,
  roles?: string[],
): Effect.Effect<TableData, SqlError | ScanError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const table = yield* queries.getTableInfo(schema, tableName)
    if (!table) {
      return yield* Effect.fail(new ScanError({
        message: `Table ${schema}.${tableName} not found`,
      }))
    }

    const {
      tableGrants,
      columnGrants,
      policies,
      triggers,
      columnDefinitions,
      constraintDefinitions,
      indexDefinitions,
      partitionInfo,
      tableComment,
    } = yield* Effect.all({
      tableGrants: queries.getGrants(schema, tableName, "table", roles),
      columnGrants: queries.getGrants(schema, tableName, "column", roles),
      policies: queries.getPolicies(schema, tableName),
      triggers: queries.getTriggers(schema, tableName),
      columnDefinitions: queries.getColumnDefinitions(schema, tableName),
      constraintDefinitions: queries.getConstraintDefinitions(schema, tableName),
      indexDefinitions: queries.getIndexDefinitions(schema, tableName),
      partitionInfo: table.relkind === "p"
        ? queries.getPartitionInfo(schema, tableName)
        : Effect.succeed(null),
      tableComment: queries.getTableComment(schema, tableName),
    }, { concurrency: "unbounded" })

    return {
      table: tableName,
      owner: table.owner,
      rls: {
        enabled: table.relrowsecurity,
        force: table.relforcerowsecurity,
        policies: [...policies],
      },
      rbac: {
        table_grants: [...tableGrants],
        column_grants: [...columnGrants],
      },
      triggers: [...triggers],
      column_definitions: [...columnDefinitions],
      constraint_definitions: [...constraintDefinitions],
      index_definitions: [...indexDefinitions],
      partition_info: partitionInfo,
      comment: tableComment,
    }
  })

export const scanFunction = (
  schema: string,
  functionName: string,
  roles?: string[],
): Effect.Effect<FunctionData, SqlError | ScanError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const functions = yield* queries.getFunctions(schema)
    const func = functions.find((f) => f.function_name === functionName)
    if (!func) {
      return yield* Effect.fail(new ScanError({
        message: `Function ${schema}.${functionName} not found`,
      }))
    }
    return { info: func, grantRoles: roles ?? [] }
  })
