/**
 * Database queries for Tablerizer — Effect-TS version
 *
 * CONCEPTS EFFECT INTRODUITS :
 *   1. SqlClient.SqlClient  → le service standard pour les queries SQL
 *   2. sql.unsafe()         → exécuter du SQL brut avec des paramètres
 *   3. Statement<A>         → c'est un Effect ! On peut le yield* directement
 */

import { Effect, pipe } from "effect"
import { SqlClient } from "@effect/sql"
import type { SqlError } from "@effect/sql/SqlError"
import {
  type FunctionInfo,
  type ColumnDefinition,
  type ConstraintDefinition,
  type IndexDefinition,
  type PartitionInfo,
  type MaterializedViewInfo,
} from "./database.js"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONCEPT — SqlClient et sql.unsafe()
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Avant (notre code custom) :
//   const db = yield* DatabaseConnection    // notre Tag fait main
//   const rows = yield* db.query<T>(sql, params)
//
// Après (@effect/sql) :
//   const sql = yield* SqlClient.SqlClient  // le Tag standard
//   const rows = yield* sql.unsafe<T>(sqlText, params)
//
// sql.unsafe() retourne un Statement<T> qui EST un Effect.
// Donc yield* l'exécute directement et donne les rows.
//
// "unsafe" ne veut pas dire "dangereux" — ça veut dire
// "pas de template literal tag". C'est pour les requêtes
// SQL dynamiques ou avec des paramètres $1, $2.
//
// Pour les requêtes statiques, on pourrait utiliser :
//   sql`SELECT * FROM users WHERE id = ${id}`
// Mais nos queries utilisent $1/$2, donc unsafe convient.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// --- Helper : factoriser le pattern répétitif ---

const query = <T extends object>(
  sqlText: string,
  params?: any[],
): Effect.Effect<ReadonlyArray<T>, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.unsafe<T>(sqlText, params)
  })

// --- Première fonction : version commentée ---

export const getTables = (
  schema: string,
): Effect.Effect<ReadonlyArray<{ table_name: string }>, SqlError, SqlClient.SqlClient> =>
  query<{ table_name: string }>(
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

// --- Toutes les queries utilisent maintenant le helper ---

export const getFunctions = (
  schema: string,
): Effect.Effect<ReadonlyArray<FunctionInfo>, SqlError, SqlClient.SqlClient> =>
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
): Effect.Effect<ReadonlyArray<MaterializedViewInfo>, SqlError, SqlClient.SqlClient> =>
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
): Effect.Effect<ReadonlyArray<{ index_name: string; index_definition: string }>, SqlError, SqlClient.SqlClient> =>
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
): Effect.Effect<TableInfo | null, SqlError, SqlClient.SqlClient> =>
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
    Effect.map((rows) => rows[0] ?? null),
  )

export const getColumnDefinitions = (
  schema: string,
  tableName: string,
): Effect.Effect<ReadonlyArray<ColumnDefinition>, SqlError, SqlClient.SqlClient> =>
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
): Effect.Effect<ReadonlyArray<ConstraintDefinition>, SqlError, SqlClient.SqlClient> =>
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
): Effect.Effect<ReadonlyArray<IndexDefinition>, SqlError, SqlClient.SqlClient> =>
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
): Effect.Effect<PartitionInfo | null, SqlError, SqlClient.SqlClient> =>
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

export const getGrants = (
  schema: string,
  objectName: string,
  source: GrantSource,
  roles?: string[],
): Effect.Effect<ReadonlyArray<any>, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const roleFilter = roles ? `AND grantee = ANY($3::text[])` : ""
    const params: any[] = [schema, objectName]
    if (roles) params.push(`{${roles.join(",")}}`)

    if (source === "column") {
      return yield* sql.unsafe(
        `
        SELECT column_name, grantor, grantee, privilege_type as privilege, is_grantable::boolean
        FROM information_schema.column_privileges
        WHERE table_schema = $1 AND table_name = $2 ${roleFilter}
        ORDER BY column_name, grantee, privilege_type
        `,
        params,
      )
    }

    return yield* sql.unsafe(
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
): Effect.Effect<ReadonlyArray<any>, SqlError, SqlClient.SqlClient> =>
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
): Effect.Effect<ReadonlyArray<any>, SqlError, SqlClient.SqlClient> =>
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
): Effect.Effect<string | undefined, SqlError, SqlClient.SqlClient> =>
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
