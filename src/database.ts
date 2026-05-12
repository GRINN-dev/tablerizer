/**
 * Database connection and query utilities for Tablerizer
 */

import { SQL } from "bun";

export interface DatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T = any>(text: string, params?: any[]): Promise<T[]>;
}

export class BunSQLConnection implements DatabaseConnection {
  private sql: InstanceType<typeof SQL>;

  constructor(connectionString: string) {
    this.sql = new SQL(connectionString);
  }

  async connect(): Promise<void> {
    // Bun SQL connects on first query; verify connectivity here
    await this.sql.unsafe("SELECT 1");
  }

  async disconnect(): Promise<void> {
    await this.sql.close();
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const rows = await this.sql.unsafe(text, params);
    return rows as T[];
  }
}

export function createConnection(connectionString: string): DatabaseConnection {
  return new BunSQLConnection(connectionString);
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

export interface MaterializedViewInfo {
  schema_name: string;
  matview_name: string;
  definition: string;
  owner: string;
  comment: string | null;
  is_populated: boolean;
}

