/**
 * Database query functions extracted from the Tablerizer class.
 * Each function takes a DatabaseConnection (and optionally roles) as parameters.
 */

import type {
  DatabaseConnection,
  FunctionInfo,
  ColumnDefinition,
  ConstraintDefinition,
  IndexDefinition,
  PartitionInfo,
  MaterializedViewInfo,
} from "./database.js";
import type { TableData } from "./generators.js";

/**
 * Get list of tables in a schema
 * Includes ordinary tables and partitioned tables, but excludes individual partitions
 */
export async function getTables(
  connection: DatabaseConnection,
  schema: string
): Promise<Array<{ table_name: string }>> {
  return await connection.query<{ table_name: string }>(
    `
      SELECT c.relname as table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE (
          c.relkind = 'r'  -- ordinary tables
          OR c.relkind = 'p'  -- partitioned tables (parent tables)
        )
        AND n.nspname = $1
        -- Exclude partition tables (tables that inherit from a partitioned parent)
        AND NOT EXISTS (
          SELECT 1 
          FROM pg_inherits i
          JOIN pg_class parent ON parent.oid = i.inhparent
          WHERE i.inhrelid = c.oid 
            AND parent.relkind = 'p'  -- parent is a partitioned table
        )
      ORDER BY c.relname
      `,
    [schema]
  );
}

/**
 * Get list of functions in a schema
 */
export async function getFunctions(
  connection: DatabaseConnection,
  schema: string
): Promise<FunctionInfo[]> {
  return await connection.query<FunctionInfo>(
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
        AND p.prokind IN ('f', 'p')  -- functions and procedures only
      ORDER BY p.proname
      `,
    [schema]
  );
}

/**
 * Get list of materialized views in a schema
 */
export async function getMaterializedViews(
  connection: DatabaseConnection,
  schema: string
): Promise<MaterializedViewInfo[]> {
  return await connection.query<MaterializedViewInfo>(
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
      WHERE c.relkind = 'm'  -- materialized views
        AND n.nspname = $1
      ORDER BY c.relname
      `,
    [schema]
  );
}

/**
 * Get grants for a materialized view
 */
export async function getMaterializedViewGrants(
  connection: DatabaseConnection,
  schema: string,
  matviewName: string,
  roles?: string[]
) {
  const roleFilter = roles ? `AND grantee = ANY($3)` : "";
  const params = [schema, matviewName];
  if (roles) {
    params.push(roles as any);
  }

  return await connection.query(
    `
      SELECT grantor, grantee, privilege_type as privilege, is_grantable::boolean
      FROM information_schema.table_privileges
      WHERE table_schema = $1 AND table_name = $2 ${roleFilter}
      ORDER BY grantee, privilege_type
      `,
    params
  );
}

/**
 * Get indexes for a materialized view
 */
export async function getMaterializedViewIndexes(
  connection: DatabaseConnection,
  schema: string,
  matviewName: string
) {
  return await connection.query<{
    index_name: string;
    index_definition: string;
  }>(
    `
      SELECT 
        i.relname as index_name,
        pg_get_indexdef(i.oid) as index_definition
      FROM pg_class i
      JOIN pg_index ix ON ix.indexrelid = i.oid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE t.relkind = 'm'  -- materialized views
        AND n.nspname = $1
        AND t.relname = $2
      ORDER BY i.relname
      `,
    [schema, matviewName]
  );
}

/**
 * Get comprehensive table data including DDL, RBAC, RLS, triggers, constraints, etc.
 */
export async function getTableData(
  connection: DatabaseConnection,
  schema: string,
  tableName: string,
  roles?: string[]
): Promise<TableData> {
  // Get basic table info (handles both ordinary and partitioned tables)
  const tableInfo = await connection.query<{
    oid: number;
    owner: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
    relkind: string;
  }>(
    `
      SELECT c.oid, r.rolname as owner, c.relrowsecurity, c.relforcerowsecurity, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
      WHERE (c.relkind = 'r' OR c.relkind = 'p') AND n.nspname = $1 AND c.relname = $2
      `,
    [schema, tableName]
  );

  if (tableInfo.length === 0) {
    throw new Error(`Table ${schema}.${tableName} not found`);
  }

  const table = tableInfo[0];

  // Gather all data in parallel for performance
  const [
    tableGrants,
    columnGrants,
    policies,
    triggers,
    columnDefinitions,
    constraintDefinitions,
    indexDefinitions,
    partitionInfo,
    tableComment,
  ] = await Promise.all([
    getTableGrants(connection, schema, tableName, roles),
    getColumnGrants(connection, schema, tableName, roles),
    getPolicies(connection, schema, tableName),
    getTriggers(connection, schema, tableName),
    getColumnDefinitions(connection, schema, tableName),
    getConstraintDefinitions(connection, schema, tableName),
    getIndexDefinitions(connection, schema, tableName),
    table.relkind === "p"
      ? getPartitionInfo(connection, schema, tableName)
      : Promise.resolve(null),
    getTableComment(connection, schema, tableName),
  ]);

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
  };
}

/**
 * Get column definitions from pg_catalog (pg_dump-style exact types)
 */
export async function getColumnDefinitions(
  connection: DatabaseConnection,
  schema: string,
  tableName: string
): Promise<ColumnDefinition[]> {
  return await connection.query<ColumnDefinition>(
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
    [schema, tableName]
  );
}

/**
 * Get constraint definitions from pg_catalog (exact via pg_get_constraintdef)
 */
export async function getConstraintDefinitions(
  connection: DatabaseConnection,
  schema: string,
  tableName: string
): Promise<ConstraintDefinition[]> {
  return await connection.query<ConstraintDefinition>(
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
    [schema, tableName]
  );
}

/**
 * Get index definitions from pg_catalog (executable CREATE INDEX statements)
 */
export async function getIndexDefinitions(
  connection: DatabaseConnection,
  schema: string,
  tableName: string
): Promise<IndexDefinition[]> {
  return await connection.query<IndexDefinition>(
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
        -- Exclude indexes backing constraints (PK, UNIQUE, EXCLUSION)
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          WHERE c.conindid = i.oid
        )
      ORDER BY i.relname
      `,
    [schema, tableName]
  );
}

/**
 * Get partition information for a partitioned table
 */
export async function getPartitionInfo(
  connection: DatabaseConnection,
  schema: string,
  tableName: string
): Promise<PartitionInfo | null> {
  const result = await connection.query<{
    partition_strategy: string;
    partition_key: string;
  }>(
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
    [schema, tableName]
  );

  if (result.length === 0) return null;

  return {
    partition_strategy: result[0].partition_strategy,
    partition_key: result[0].partition_key,
  };
}

export async function getTableGrants(
  connection: DatabaseConnection,
  schema: string,
  tableName: string,
  roles?: string[]
) {
  const roleFilter = roles ? `AND grantee = ANY($3)` : "";
  const params = [schema, tableName];
  if (roles) {
    params.push(roles as any);
  }

  return await connection.query(
    `
      SELECT grantor, grantee, privilege_type as privilege, is_grantable::boolean
      FROM information_schema.table_privileges
      WHERE table_schema = $1 AND table_name = $2 ${roleFilter}
      ORDER BY grantee, privilege_type
      `,
    params
  );
}

export async function getColumnGrants(
  connection: DatabaseConnection,
  schema: string,
  tableName: string,
  roles?: string[]
) {
  const roleFilter = roles ? `AND grantee = ANY($3)` : "";
  const params = [schema, tableName];
  if (roles) {
    params.push(roles as any);
  }

  return await connection.query(
    `
      SELECT column_name, grantor, grantee, privilege_type as privilege, is_grantable::boolean
      FROM information_schema.column_privileges
      WHERE table_schema = $1 AND table_name = $2 ${roleFilter}
      ORDER BY column_name, grantee, privilege_type
      `,
    params
  );
}

export async function getPolicies(
  connection: DatabaseConnection,
  schema: string,
  tableName: string
) {
  return await connection.query(
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
    [schema, tableName]
  );
}

export async function getTriggers(
  connection: DatabaseConnection,
  schema: string,
  tableName: string
) {
  return await connection.query(
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
    [schema, tableName]
  );
}

export async function getTableComment(
  connection: DatabaseConnection,
  schema: string,
  tableName: string
): Promise<string | undefined> {
  const result = await connection.query<{ comment: string }>(
    `
      SELECT obj_description(c.oid) as comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND (c.relkind = 'r' OR c.relkind = 'p')
      `,
    [schema, tableName]
  );

  return result[0]?.comment || undefined;
}
