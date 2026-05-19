import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import type { SqlError } from "@effect/sql/SqlError"

const query = <T extends object>(
  sqlText: string,
  params?: any[],
): Effect.Effect<ReadonlyArray<T>, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.unsafe<T>(sqlText, params)
  })

export interface SchemaListItem {
  schema_name: string
  table_count: number
  function_count: number
  view_count: number
  matview_count: number
}

export const getSchemaList = (): Effect.Effect<
  ReadonlyArray<SchemaListItem>,
  SqlError,
  SqlClient.SqlClient
> =>
  query<SchemaListItem>(`
    SELECT
      n.nspname AS schema_name,
      COUNT(DISTINCT CASE WHEN c.relkind IN ('r','p') THEN c.oid END)::int AS table_count,
      COUNT(DISTINCT CASE WHEN c.relkind = 'v' THEN c.oid END)::int AS view_count,
      COUNT(DISTINCT CASE WHEN c.relkind = 'm' THEN c.oid END)::int AS matview_count,
      (
        SELECT COUNT(*)::int FROM pg_proc p
        WHERE p.pronamespace = n.oid AND p.prokind IN ('f','p')
      ) AS function_count
    FROM pg_namespace n
    LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relkind IN ('r','p','v','m')
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp_%'
      AND n.nspname NOT LIKE 'pg_toast_temp_%'
    GROUP BY n.oid, n.nspname
    ORDER BY n.nspname
  `)

export interface SchemaStats {
  schema_name: string
  table_count: number
  function_count: number
  view_count: number
  matview_count: number
  trigger_count: number
  policy_count: number
  rls_enabled_count: number
  rls_total_tables: number
}

export const getSchemaStats = (
  schema: string,
): Effect.Effect<SchemaStats | null, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const rows = yield* query<SchemaStats>(
      `
      SELECT
        $1::text AS schema_name,
        (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind IN ('r','p')) AS table_count,
        (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1 AND p.prokind IN ('f','p')) AS function_count,
        (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind = 'v') AS view_count,
        (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind = 'm') AS matview_count,
        (SELECT COUNT(*)::int FROM information_schema.triggers WHERE trigger_schema = $1) AS trigger_count,
        (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname = $1) AS policy_count,
        (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind IN ('r','p') AND c.relrowsecurity) AS rls_enabled_count,
        (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind IN ('r','p')) AS rls_total_tables
      `,
      [schema],
    )
    return rows[0] ?? null
  })

export interface TableListItem {
  table_name: string
  column_count: number
  constraint_count: number
  index_count: number
  has_rls: boolean
  trigger_count: number
}

export const getTableList = (
  schema: string,
): Effect.Effect<ReadonlyArray<TableListItem>, SqlError, SqlClient.SqlClient> =>
  query<TableListItem>(
    `
    SELECT
      c.relname AS table_name,
      (SELECT COUNT(*)::int FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS column_count,
      (SELECT COUNT(*)::int FROM pg_constraint con WHERE con.conrelid = c.oid) AS constraint_count,
      (SELECT COUNT(*)::int FROM pg_index ix WHERE ix.indrelid = c.oid AND NOT EXISTS (SELECT 1 FROM pg_constraint cc WHERE cc.conindid = ix.indexrelid)) AS index_count,
      c.relrowsecurity AS has_rls,
      (SELECT COUNT(*)::int FROM information_schema.triggers t WHERE t.trigger_schema = n.nspname AND t.event_object_table = c.relname) AS trigger_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relkind IN ('r','p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_inherits i
        JOIN pg_class parent ON parent.oid = i.inhparent
        WHERE i.inhrelid = c.oid AND parent.relkind = 'p'
      )
    ORDER BY c.relname
    `,
    [schema],
  )
