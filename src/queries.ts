/**
 * Database queries for Tablerizer — Effect-TS version
 *
 * CONCEPTS EFFECT INTRODUITS :
 *   1. Effect.gen     → écrire du code Effect comme du async/await
 *   2. yield*         → "donne-moi le service" OU "exécute cet Effect"
 *   3. Propagation automatique de R (Requirements)
 */

import { Effect, pipe } from "effect"
import {
  DatabaseConnection,
  DatabaseError,
  type FunctionInfo,
  type ColumnDefinition,
  type ConstraintDefinition,
  type IndexDefinition,
  type PartitionInfo,
  type MaterializedViewInfo,
} from "./database.js"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONCEPT — Effect.gen (la "killer feature" pour la lisibilité)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Effect.gen utilise les générateurs JS (function*) pour écrire
// du code Effect qui RESSEMBLE à du async/await :
//
//   // async/await (vanilla)
//   async function getUser(id: string) {
//     const db = getDb()              // dépendance manuelle
//     const row = await db.query(sql) // await = exécute la Promise
//     return row
//   }
//
//   // Effect.gen
//   const getUser = (id: string) =>
//     Effect.gen(function* () {
//       const db = yield* DatabaseConnection  // yield* Tag = accède au service
//       const row = yield* db.query(sql)      // yield* Effect = exécute l'Effect
//       return row
//     })
//
// yield* fait DEUX choses selon ce qu'on lui passe :
//   yield* MonTag        → "donne-moi le service MonTag du contexte"
//   yield* unEffect      → "exécute cet Effect et donne-moi le résultat"
//
// C'est le dual de await : await résout une Promise,
// yield* résout un Effect (ou accède à un service).
//
// CONCEPT — Propagation automatique de Requirements
//
// Regarde le type de retour de getTables :
//   Effect.Effect<Array<...>, DatabaseError, DatabaseConnection>
//                                            ^^^^^^^^^^^^^^^^^^
// TypeScript INFÈRE automatiquement que cette fonction a besoin
// de DatabaseConnection, parce qu'on fait yield* DatabaseConnection
// dedans. Si tu composes deux fonctions qui utilisent la DB,
// le besoin ne se duplique pas — il s'unifie.
//
// C'est le superpouvoir : tu n'as JAMAIS besoin de passer
// `connection` en paramètre. La dépendance voyage dans le type.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// --- Première fonction : version longue pour montrer le pattern ---

export const getTables = (
  schema: string,
): Effect.Effect<Array<{ table_name: string }>, DatabaseError, DatabaseConnection> =>
  Effect.gen(function* () {
    // yield* DatabaseConnection → accède au service depuis le contexte
    // Pas besoin de le passer en paramètre !
    const db = yield* DatabaseConnection

    // yield* db.query(...) → exécute la query (comme await)
    // Si la query échoue → DatabaseError (typé !)
    return yield* db.query<{ table_name: string }>(
      `
      SELECT c.relname as table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE (c.relkind = 'r' OR c.relkind = 'p')
        AND n.nspname = $1
        AND NOT EXISTS (
          SELECT 1 FROM pg_inherits i
          JOIN pg_class parent ON parent.oid = i.inhparent
          WHERE i.inhrelid = c.oid AND parent.relkind = 'p'
        )
      ORDER BY c.relname
      `,
      [schema],
    )
  })

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER : factoriser le pattern répétitif
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Toutes nos fonctions font la même chose :
//   1. accéder à DatabaseConnection
//   2. exécuter une query
//
// On factorise ça dans un helper. C'est un pattern courant en
// Effect : créer des "accessors" qui simplifient l'accès aux
// services.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const query = <T = any>(
  sql: string,
  params?: any[],
): Effect.Effect<T[], DatabaseError, DatabaseConnection> =>
  Effect.gen(function* () {
    const db = yield* DatabaseConnection
    return yield* db.query<T>(sql, params)
  })

// --- Toutes les queries utilisent maintenant le helper ---

export const getFunctions = (
  schema: string,
): Effect.Effect<FunctionInfo[], DatabaseError, DatabaseConnection> =>
  query<FunctionInfo>(
    `
    SELECT
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_functiondef(p.oid) as function_definition,
      pg_get_function_arguments(p.oid) as function_arguments,
      pg_get_function_result(p.oid) as return_type,
      CASE
        WHEN p.prokind = 'f' THEN 'FUNCTION'
        WHEN p.prokind = 'p' THEN 'PROCEDURE'
        WHEN p.prokind = 'a' THEN 'AGGREGATE'
        WHEN p.prokind = 'w' THEN 'WINDOW'
        ELSE 'UNKNOWN'
      END as function_type,
      l.lanname as language,
      p.prosecdef as is_security_definer,
      obj_description(p.oid, 'pg_proc') as comment,
      '' as function_signature,
      '' as volatility,
      false as security_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = $1
      AND p.prokind IN ('f', 'p')
    ORDER BY p.proname
    `,
    [schema],
  )

export const getMaterializedViews = (
  schema: string,
): Effect.Effect<MaterializedViewInfo[], DatabaseError, DatabaseConnection> =>
  query<MaterializedViewInfo>(
    `
    SELECT
      n.nspname as schema_name,
      c.relname as matview_name,
      pg_get_viewdef(c.oid) as definition,
      r.rolname as owner,
      obj_description(c.oid, 'pg_class') as comment,
      c.relispopulated as is_populated
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles r ON r.oid = c.relowner
    WHERE c.relkind = 'm'
      AND n.nspname = $1
    ORDER BY c.relname
    `,
    [schema],
  )

export const getMaterializedViewIndexes = (
  schema: string,
  matviewName: string,
): Effect.Effect<Array<{ index_name: string; index_definition: string }>, DatabaseError, DatabaseConnection> =>
  query<{ index_name: string; index_definition: string }>(
    `
    SELECT
      i.relname as index_name,
      pg_get_indexdef(i.oid) as index_definition
    FROM pg_class i
    JOIN pg_index ix ON ix.indexrelid = i.oid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relkind = 'm'
      AND n.nspname = $1
      AND t.relname = $2
    ORDER BY i.relname
    `,
    [schema, matviewName],
  )

export interface TableInfo {
  oid: number
  owner: string
  relrowsecurity: boolean
  relforcerowsecurity: boolean
  relkind: string
}

export const getTableInfo = (
  schema: string,
  tableName: string,
): Effect.Effect<TableInfo | null, DatabaseError, DatabaseConnection> =>
  pipe(
    query<TableInfo>(
      `
      SELECT c.oid, r.rolname as owner, c.relrowsecurity, c.relforcerowsecurity, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
      WHERE (c.relkind = 'r' OR c.relkind = 'p') AND n.nspname = $1 AND c.relname = $2
      `,
      [schema, tableName],
    ),
    // Effect.map transforme le résultat sans changer les erreurs ni les requirements
    Effect.map((rows) => rows[0] ?? null),
  )

export const getColumnDefinitions = (
  schema: string,
  tableName: string,
): Effect.Effect<ColumnDefinition[], DatabaseError, DatabaseConnection> =>
  query<ColumnDefinition>(
    `
    SELECT
      a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS not_null,
      pg_get_expr(d.adbin, d.adrelid) AS column_default,
      col_description(a.attrelid, a.attnum) AS comment,
      a.attnum AS ordinal_position
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON (a.attrelid = d.adrelid AND a.attnum = d.adnum)
    WHERE n.nspname = $1
      AND c.relname = $2
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
    `,
    [schema, tableName],
  )

export const getConstraintDefinitions = (
  schema: string,
  tableName: string,
): Effect.Effect<ConstraintDefinition[], DatabaseError, DatabaseConnection> =>
  query<ConstraintDefinition>(
    `
    SELECT
      con.conname AS constraint_name,
      con.contype AS constraint_type,
      pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relname = $2
    ORDER BY
      CASE con.contype
        WHEN 'p' THEN 1
        WHEN 'u' THEN 2
        WHEN 'f' THEN 3
        WHEN 'c' THEN 4
        WHEN 'x' THEN 5
      END,
      con.conname
    `,
    [schema, tableName],
  )

export const getIndexDefinitions = (
  schema: string,
  tableName: string,
): Effect.Effect<IndexDefinition[], DatabaseError, DatabaseConnection> =>
  query<IndexDefinition>(
    `
    SELECT
      i.relname AS index_name,
      pg_get_indexdef(i.oid) AS index_definition,
      obj_description(i.oid, 'pg_class') AS comment
    FROM pg_class i
    JOIN pg_index ix ON ix.indexrelid = i.oid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE (t.relkind = 'r' OR t.relkind = 'p')
      AND n.nspname = $1
      AND t.relname = $2
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conindid = i.oid
      )
    ORDER BY i.relname
    `,
    [schema, tableName],
  )

export const getPartitionInfo = (
  schema: string,
  tableName: string,
): Effect.Effect<PartitionInfo | null, DatabaseError, DatabaseConnection> =>
  pipe(
    query<{ partition_strategy: string; partition_key: string }>(
      `
      SELECT
        pt.partstrat AS partition_strategy,
        pg_get_partkeydef(c.oid) AS partition_key
      FROM pg_partitioned_table pt
      JOIN pg_class c ON c.oid = pt.partrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relname = $2
      `,
      [schema, tableName],
    ),
    Effect.map((rows) =>
      rows.length === 0
        ? null
        : { partition_strategy: rows[0].partition_strategy, partition_key: rows[0].partition_key },
    ),
  )

export type GrantSource = "table" | "column"

// getGrants a de la logique conditionnelle → on utilise Effect.gen
export const getGrants = (
  schema: string,
  objectName: string,
  source: GrantSource,
  roles?: string[],
): Effect.Effect<any[], DatabaseError, DatabaseConnection> =>
  Effect.gen(function* () {
    const db = yield* DatabaseConnection
    const roleFilter = roles ? `AND grantee = ANY($3::text[])` : ""
    const params: any[] = [schema, objectName]
    if (roles) params.push(`{${roles.join(",")}}`)

    if (source === "column") {
      return yield* db.query(
        `
        SELECT column_name, grantor, grantee, privilege_type as privilege, is_grantable::boolean
        FROM information_schema.column_privileges
        WHERE table_schema = $1 AND table_name = $2 ${roleFilter}
        ORDER BY column_name, grantee, privilege_type
        `,
        params,
      )
    }

    return yield* db.query(
      `
      SELECT grantor, grantee, privilege_type as privilege, is_grantable::boolean
      FROM information_schema.table_privileges
      WHERE table_schema = $1 AND table_name = $2 ${roleFilter}
      ORDER BY grantee, privilege_type
      `,
      params,
    )
  })

export const getPolicies = (
  schema: string,
  tableName: string,
): Effect.Effect<any[], DatabaseError, DatabaseConnection> =>
  query(
    `
    SELECT
      policyname as policy,
      cmd,
      CASE
        WHEN roles IS NULL THEN NULL
        ELSE roles
      END as roles,
      permissive,
      qual as using,
      with_check
    FROM pg_policies
    WHERE schemaname = $1 AND tablename = $2
    ORDER BY policyname
    `,
    [schema, tableName],
  )

export const getTriggers = (
  schema: string,
  tableName: string,
): Effect.Effect<any[], DatabaseError, DatabaseConnection> =>
  query(
    `
    SELECT
      trigger_name,
      action_timing,
      event_manipulation,
      action_orientation,
      action_statement,
      action_condition,
      1 as action_order
    FROM information_schema.triggers
    WHERE trigger_schema = $1 AND event_object_table = $2
    ORDER BY trigger_name, event_manipulation
    `,
    [schema, tableName],
  )

export const getTableComment = (
  schema: string,
  tableName: string,
): Effect.Effect<string | undefined, DatabaseError, DatabaseConnection> =>
  pipe(
    query<{ comment: string }>(
      `
      SELECT obj_description(c.oid) as comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND (c.relkind = 'r' OR c.relkind = 'p')
      `,
      [schema, tableName],
    ),
    Effect.map((rows) => rows[0]?.comment || undefined),
  )
