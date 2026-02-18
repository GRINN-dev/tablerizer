/**
 * Database connection and query utilities for Tablerizer
 */

import { Client } from "pg";

export interface DatabaseConnection {
  client: Client;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T = any>(text: string, params?: any[]): Promise<T[]>;
}

export class PostgreSQLConnection implements DatabaseConnection {
  public client: Client;

  constructor(connectionString: string) {
    this.client = new Client({ connectionString });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.end();
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const result = await this.client.query(text, params);
    return result.rows;
  }
}

/**
 * Create a database connection from connection string
 */
export function createConnection(connectionString: string): DatabaseConnection {
  return new PostgreSQLConnection(connectionString);
}

/**
 * Database table and schema information interfaces
 */
export interface TableInfo {
  table_name: string;
  schemaname: string;
}

export interface PolicyInfo {
  policyname: string;
  tablename: string;
  schemaname: string;
  roles: string[];
  cmd: string;
  qual?: string;
  with_check?: string;
}

export interface GrantInfo {
  table_name: string;
  grantee: string;
  privilege_type: string;
  is_grantable: boolean;
}

export interface ColumnGrantInfo {
  table_name: string;
  column_name: string;
  grantee: string;
  privilege_type: string;
  is_grantable: boolean;
}

export interface TriggerInfo {
  trigger_name: string;
  table_name: string;
  event_manipulation: string;
  action_statement: string;
  action_timing: string;
  action_orientation: string;
}

export interface FunctionInfo {
  schema_name: string;
  function_name: string;
  function_signature: string;
  function_definition: string;
  return_type: string;
  language: string;
  volatility: string;
  security_definer: boolean;
  function_arguments: string;
  function_type: string;
  is_security_definer: boolean;
  comment: string | null;
}

export interface ConstraintInfo {
  constraint_name: string;
  constraint_type: string;
  table_name: string;
  column_name?: string;
  foreign_table_schema?: string;
  foreign_table_name?: string;
  foreign_column_name?: string;
  check_clause?: string;
}

/**
 * Column definition from pg_catalog (pg_dump-style exact types)
 */
export interface ColumnDefinition {
  column_name: string;
  data_type: string;
  not_null: boolean;
  column_default: string | null;
  comment: string | null;
  ordinal_position: number;
}

/**
 * Constraint definition from pg_catalog (exact definition via pg_get_constraintdef)
 */
export interface ConstraintDefinition {
  constraint_name: string;
  constraint_type: string; // 'p' = PK, 'u' = UNIQUE, 'f' = FK, 'c' = CHECK, 'x' = EXCLUSION
  definition: string;
}

/**
 * Index definition from pg_catalog
 */
export interface IndexDefinition {
  index_name: string;
  index_definition: string;
  comment: string | null;
}

/**
 * Table partition info
 */
export interface PartitionInfo {
  partition_strategy: string; // 'r' = range, 'l' = list, 'h' = hash
  partition_key: string;
}

export interface ViewInfo {
  schema_name: string;
  view_name: string;
  definition: string;
  owner: string;
  comment: string | null;
  is_updatable: boolean;
}

export interface MaterializedViewInfo {
  schema_name: string;
  matview_name: string;
  definition: string;
  owner: string;
  comment: string | null;
  is_populated: boolean;
}

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default?: string;
  character_maximum_length?: number;
  numeric_precision?: number;
  numeric_scale?: number;
  comment?: string;
}
