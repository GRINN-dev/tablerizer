/**
 * Object scanner for Tablerizer — Effect-TS version
 *
 * CONCEPTS EFFECT INTRODUITS :
 *   1. Effect.all       → remplace Promise.all (+ concurrence bornée !)
 *   2. Effect.all({})   → variante avec un record (résultats nommés)
 *   3. Propagation de R → DatabaseConnection se propage automatiquement
 *   4. Union d'erreurs  → E s'unifie automatiquement dans la composition
 */

import { Effect, Data, pipe } from "effect"
import { DatabaseConnection, DatabaseError, type FunctionInfo, type MaterializedViewInfo, type TableData } from "./database.js"
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
// CONCEPT — Effect.all avec concurrency
//
// L'ancien code avait une fonction `parallel()` maison de 15 lignes
// pour gérer la concurrence bornée. Effect la remplace par UN paramètre :
//
//   Effect.all(effects, { concurrency: 2 })
//
// Options de concurrence :
//   • pas de param      → séquentiel (un par un)
//   • { concurrency: n } → n en parallèle maximum
//   • { concurrency: "unbounded" } → tout en parallèle (= Promise.all)
//
// CONCEPT — Propagation automatique de Requirements
//
// Remarque qu'on n'a PAS `connection` en paramètre. Pourtant,
// toutes les queries ont besoin de DatabaseConnection.
//
// Comment ça marche ? Quand on écrit :
//   yield* queries.getTables(schema)  // Effect<..., DatabaseError, DatabaseConnection>
//
// Le requirement DatabaseConnection "remonte" automatiquement dans
// le type de la fonction appelante. Le compilateur l'infère tout seul.
// C'est la magie de la composition d'Effects.
//
// CONCEPT — Union automatique d'erreurs
//
// Même principe pour les erreurs :
//   queries.*    → peut échouer avec DatabaseError
//   scanTable    → peut aussi échouer avec ScanError
//
// Le type de scan est donc :
//   Effect<ObjectDescriptor[], DatabaseError | ScanError, DatabaseConnection>
//                               ^^^^^^^^^^^^^^^^^^^^^^^^^
//                               union automatique !
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Listing =
  | { schema: string; kind: "tables"; items: { table_name: string }[] }
  | { schema: string; kind: "functions"; items: FunctionInfo[] }
  | { schema: string; kind: "matviews"; items: MaterializedViewInfo[] }

export const scan = (
  schemas: string[],
  scope: ExportScope[],
  roles?: string[],
): Effect.Effect<ObjectDescriptor[], DatabaseError | ScanError, DatabaseConnection> =>
  Effect.gen(function* () {
    // ── Phase 1 : Lister les objets (tout en parallèle) ──
    //
    // On construit un tableau d'Effects, puis on les lance tous
    // d'un coup avec Effect.all + concurrency: "unbounded".
    const listingEffects = schemas.flatMap((schema) => {
      const effects: Effect.Effect<Listing, DatabaseError, DatabaseConnection>[] = []
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
    //
    // C'est ICI que Effect brille. L'ancien code avait 15 lignes
    // de worker pool maison. Maintenant c'est juste :
    //   Effect.all(effects, { concurrency: HYDRATION_CONCURRENCY })
    const hydrationEffects = listings.flatMap(
      (listing): Effect.Effect<ObjectDescriptor, DatabaseError | ScanError, DatabaseConnection>[] => {
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
                  data: { info: mv, grants, indexes } satisfies MaterializedViewData,
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
//
// CONCEPT — Effect.all avec un RECORD (objet)
//
// Au lieu de : const [a, b, c] = yield* Effect.all([e1, e2, e3])
// On peut :   const { a, b, c } = yield* Effect.all({ a: e1, b: e2, c: e3 })
//
// Avantage : les résultats sont NOMMÉS, pas positionnels.
// Plus lisible quand il y a 9 queries en parallèle !
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const scanTable = (
  schema: string,
  tableName: string,
  roles?: string[],
): Effect.Effect<TableData, DatabaseError | ScanError, DatabaseConnection> =>
  Effect.gen(function* () {
    const table = yield* queries.getTableInfo(schema, tableName)
    if (!table) {
      return yield* Effect.fail(new ScanError({
        message: `Table ${schema}.${tableName} not found`,
      }))
    }

    // Effect.all avec un record : 9 queries en parallèle,
    // résultats nommés. Compacte et lisible.
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
        policies,
      },
      rbac: {
        table_grants: tableGrants,
        column_grants: columnGrants,
      },
      triggers,
      column_definitions: columnDefinitions,
      constraint_definitions: constraintDefinitions,
      index_definitions: indexDefinitions,
      partition_info: partitionInfo,
      comment: tableComment,
    }
  })

export const scanFunction = (
  schema: string,
  functionName: string,
  roles?: string[],
): Effect.Effect<FunctionData, DatabaseError | ScanError, DatabaseConnection> =>
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
