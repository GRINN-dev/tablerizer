/**
 * Main Tablerizer class - PostgreSQL Table Export Wizard
 */

import fs from "fs/promises";
import path from "path";
import type { DatabaseConnection, FunctionInfo } from "./database.js";
import { createConnection } from "./database.js";
import type { TablerizerOptions, ExportScope } from "./config.js";
import { validateConfig, mergeConfigs, getDefaultConfig } from "./config.js";
import {
  generateTableSQL,
  generateFunctionSQL,
  applyRoleMappings,
  type TableData,
} from "./generators.js";

export interface ExportResult {
  schemas: string[];
  totalFiles: number;
  outputPath: string;
  tableFiles: number;
  functionFiles: number;
  files: Array<{
    schema: string;
    name: string;
    type: "table" | "function";
    filePath: string;
    size: number;
  }>;
}

export interface ExportProgress {
  schema: string;
  table: string;
  progress: number;
  total: number;
}

export type ProgressCallback = (progress: ExportProgress) => void;

/**
 * Main Tablerizer class for exporting PostgreSQL table permissions and schemas
 */
export class Tablerizer {
  private connection: DatabaseConnection | null = null;
  private options: TablerizerOptions;

  constructor(options: Partial<TablerizerOptions> = {}) {
    this.options = mergeConfigs(getDefaultConfig(), options);
  }

  /**
   * Configure the exporter with new options
   */
  configure(options: Partial<TablerizerOptions>): void {
    this.options = mergeConfigs(this.options, options);
  }

  /**
   * Connect to the database
   */
  async connect(connectionString?: string): Promise<void> {
    const dbUrl = connectionString || this.options.database_url;
    if (!dbUrl) {
      throw new Error("Database connection string is required");
    }

    this.connection = createConnection(dbUrl);
    await this.connection.connect();
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = null;
    }
  }

  /**
   * Export tables and/or functions for all configured schemas
   */
  async export(progressCallback?: ProgressCallback): Promise<ExportResult> {
    validateConfig(this.options);

    if (!this.connection) {
      await this.connect();
    }

    const baseOutputDir = this.options.out || "./tables";
    const files: ExportResult["files"] = [];
    let totalFiles = 0;
    let tableFiles = 0;
    let functionFiles = 0;

    // Determine what to export based on scope
    const scope = this.normalizeScope(this.options.scope);
    const exportTables = scope.includes("tables");
    const exportFunctions = scope.includes("functions");

    // Ensure base output directory exists
    await fs.mkdir(baseOutputDir, { recursive: true });

    for (const schema of this.options.schemas) {
      const schemaOutputDir = path.join(baseOutputDir, schema);
      await fs.mkdir(schemaOutputDir, { recursive: true });

      let progressCounter = 0;
      let totalItems = 0;

      // Count total items for progress reporting
      if (exportTables) {
        const tables = await this.getTables(schema);
        totalItems += tables.length;
      }
      if (exportFunctions) {
        const functions = await this.getFunctions(schema);
        totalItems += functions.length;
      }

      // Export tables
      if (exportTables) {
        const tables = await this.getTables(schema);

        for (const table of tables) {
          progressCounter++;

          // Report progress
          if (progressCallback) {
            progressCallback({
              schema,
              table: table.table_name,
              progress: progressCounter,
              total: totalItems,
            });
          }

          // Get table data
          const tableData = await this.getTableData(schema, table.table_name);

          // Generate SQL content
          const sqlContent = generateTableSQL(
            schema,
            tableData,
            this.options.role_mappings,
            this.options.include_date
          );

          // Write file
          const fileName = `${table.table_name}.sql`;
          const filePath = path.join(schemaOutputDir, "tables", fileName);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, sqlContent);

          files.push({
            schema,
            name: table.table_name,
            type: "table",
            filePath,
            size: sqlContent.length,
          });
          totalFiles++;
          tableFiles++;
        }
      }

      // Export functions
      if (exportFunctions) {
        const functions = await this.getFunctions(schema);

        for (const func of functions) {
          progressCounter++;

          // Report progress
          if (progressCallback) {
            progressCallback({
              schema,
              table: func.function_name, // Using table field for compatibility
              progress: progressCounter,
              total: totalItems,
            });
          }

          // Generate SQL content
          const sqlContent = generateFunctionSQL(
            func,
            this.options.roles,
            this.options.role_mappings,
            this.options.include_date
          );

          // Write file - handle function overloading by including arguments hash
          let fileName = `${func.function_name}.sql`;
          let filePath = path.join(schemaOutputDir, "functions", fileName);

          // Handle overloaded functions
          let counter = 1;
          while (files.some((f) => f.filePath === filePath)) {
            fileName = `${func.function_name}_${counter}.sql`;
            filePath = path.join(schemaOutputDir, "functions", fileName);
            counter++;
          }

          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, sqlContent);

          files.push({
            schema,
            name: func.function_name,
            type: "function",
            filePath,
            size: sqlContent.length,
          });
          totalFiles++;
          functionFiles++;
        }
      }
    }

    return {
      schemas: this.options.schemas,
      totalFiles,
      tableFiles,
      functionFiles,
      outputPath: path.resolve(baseOutputDir),
      files,
    };
  }

  /**
   * Export a single table
   */
  async exportTable(
    schema: string,
    tableName: string,
    outputPath?: string
  ): Promise<string> {
    validateConfig(this.options);

    if (!this.connection) {
      await this.connect();
    }

    // Get table data
    const tableData = await this.getTableData(schema, tableName);

    // Generate SQL content
    const sqlContent = generateTableSQL(
      schema,
      tableData,
      this.options.role_mappings,
      this.options.include_date
    );

    // Write file if output path is provided
    if (outputPath) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, sqlContent);
    }

    return sqlContent;
  }

  /**
   * Export a single function
   */
  async exportFunction(
    schema: string,
    functionName: string,
    outputPath?: string
  ): Promise<string> {
    validateConfig(this.options);

    if (!this.connection) {
      await this.connect();
    }

    // Get function data
    const functions = await this.getFunctions(schema);
    const func = functions.find((f) => f.function_name === functionName);

    if (!func) {
      throw new Error(`Function ${schema}.${functionName} not found`);
    }

    // Generate SQL content
    const sqlContent = generateFunctionSQL(
      func,
      this.options.roles,
      this.options.role_mappings,
      this.options.include_date
    );

    // Write file if output path is provided
    if (outputPath) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, sqlContent);
    }

    return sqlContent;
  }

  /**
   * Export functions only (convenience method)
   */
  async exportFunctions(
    progressCallback?: ProgressCallback
  ): Promise<ExportResult> {
    const originalScope = this.options.scope;
    this.options.scope = "functions";

    try {
      return await this.export(progressCallback);
    } finally {
      this.options.scope = originalScope;
    }
  }

  /**
   * Export tables only (convenience method)
   */
  async exportTables(
    progressCallback?: ProgressCallback
  ): Promise<ExportResult> {
    const originalScope = this.options.scope;
    this.options.scope = "tables";

    try {
      return await this.export(progressCallback);
    } finally {
      this.options.scope = originalScope;
    }
  }

  /**
   * Normalize scope configuration to array format
   */
  private normalizeScope(scope?: ExportScope | ExportScope[]): ExportScope[] {
    if (!scope || scope === "all") {
      return ["tables", "functions"];
    }
    if (Array.isArray(scope)) {
      return scope;
    }
    return [scope];
  }

  /**
   * Get list of tables in a schema
   */
  private async getTables(
    schema: string
  ): Promise<Array<{ table_name: string }>> {
    if (!this.connection) {
      throw new Error("Not connected to database");
    }

    return await this.connection.query<{ table_name: string }>(
      `
      SELECT c.relname as table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'  -- ordinary tables
        AND n.nspname = $1
      ORDER BY c.relname
      `,
      [schema]
    );
  }

  /**
   * Get list of functions in a schema
   */
  private async getFunctions(schema: string): Promise<FunctionInfo[]> {
    if (!this.connection) {
      throw new Error("Not connected to database");
    }

    return await this.connection.query<FunctionInfo>(
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
   * Get comprehensive table data including RBAC, RLS, triggers, constraints, etc.
   */
  private async getTableData(
    schema: string,
    tableName: string
  ): Promise<TableData> {
    if (!this.connection) {
      throw new Error("Not connected to database");
    }

    // Get basic table info
    const tableInfo = await this.connection.query<{
      oid: number;
      owner: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `
      SELECT c.oid, r.rolname as owner, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
      WHERE c.relkind = 'r' AND n.nspname = $1 AND c.relname = $2
      `,
      [schema, tableName]
    );

    if (tableInfo.length === 0) {
      throw new Error(`Table ${schema}.${tableName} not found`);
    }

    const table = tableInfo[0];

    // Get table grants
    const tableGrants = await this.getTableGrants(schema, tableName);

    // Get column grants
    const columnGrants = await this.getColumnGrants(schema, tableName);

    // Get RLS policies
    const policies = await this.getPolicies(schema, tableName);

    // Get triggers
    const triggers = await this.getTriggers(schema, tableName);

    // Get columns
    const columns = await this.getColumns(schema, tableName);

    // Get constraints
    const constraints = await this.getConstraints(schema, tableName);

    // Get table comment
    const tableComment = await this.getTableComment(schema, tableName);

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
      columns,
      constraints,
      comment: tableComment,
    };
  }

  private async getTableGrants(schema: string, tableName: string) {
    const roleFilter = this.options.roles ? `AND grantee = ANY($3)` : "";
    const params = [schema, tableName];
    if (this.options.roles) {
      params.push(this.options.roles as any);
    }

    return await this.connection!.query(
      `
      SELECT grantor, grantee, privilege_type as privilege, is_grantable::boolean
      FROM information_schema.table_privileges
      WHERE table_schema = $1 AND table_name = $2 ${roleFilter}
      `,
      params
    );
  }

  private async getColumnGrants(schema: string, tableName: string) {
    const roleFilter = this.options.roles ? `AND grantee = ANY($3)` : "";
    const params = [schema, tableName];
    if (this.options.roles) {
      params.push(this.options.roles as any);
    }

    return await this.connection!.query(
      `
      SELECT column_name, grantor, grantee, privilege_type as privilege, is_grantable::boolean
      FROM information_schema.column_privileges
      WHERE table_schema = $1 AND table_name = $2 ${roleFilter}
      `,
      params
    );
  }

  private async getPolicies(schema: string, tableName: string) {
    return await this.connection!.query(
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
      `,
      [schema, tableName]
    );
  }

  private async getTriggers(schema: string, tableName: string) {
    return await this.connection!.query(
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

  private async getColumns(schema: string, tableName: string) {
    return await this.connection!.query(
      `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        col_description(c.oid, a.attnum) as comment
      FROM information_schema.columns isc
      LEFT JOIN pg_class c ON c.relname = isc.table_name
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = isc.table_schema
      LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = isc.column_name
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
      `,
      [schema, tableName]
    );
  }

  private async getConstraints(schema: string, tableName: string) {
    return await this.connection!.query(
      `
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name as foreign_table_name,
        ccu.column_name as foreign_column_name,
        cc.check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.constraint_schema
      LEFT JOIN information_schema.check_constraints cc 
        ON tc.constraint_name = cc.constraint_name AND tc.table_schema = cc.constraint_schema
      WHERE tc.table_schema = $1 AND tc.table_name = $2
      ORDER BY tc.constraint_type, tc.constraint_name
      `,
      [schema, tableName]
    );
  }

  private async getTableComment(
    schema: string,
    tableName: string
  ): Promise<string | undefined> {
    const result = await this.connection!.query<{ comment: string }>(
      `
      SELECT obj_description(c.oid) as comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'r'
      `,
      [schema, tableName]
    );

    return result[0]?.comment || undefined;
  }
}

/**
 * Convenience function to create and use Tablerizer
 */
export async function exportTables(
  options: TablerizerOptions,
  progressCallback?: ProgressCallback
): Promise<ExportResult> {
  const tablerizer = new Tablerizer(options);
  try {
    const result = await tablerizer.export(progressCallback);
    return result;
  } finally {
    await tablerizer.disconnect();
  }
}

/**
 * Convenience function to export a single function
 */
export async function exportFunction(
  schema: string,
  functionName: string,
  options: TablerizerOptions,
  outputPath?: string
): Promise<string> {
  const tablerizer = new Tablerizer(options);
  try {
    return await tablerizer.exportFunction(schema, functionName, outputPath);
  } finally {
    await tablerizer.disconnect();
  }
}

/**
 * Convenience function to export functions only
 */
export async function exportFunctions(
  options: TablerizerOptions,
  progressCallback?: ProgressCallback
): Promise<ExportResult> {
  const tablerizer = new Tablerizer({ ...options, scope: "functions" });
  try {
    const result = await tablerizer.export(progressCallback);
    return result;
  } finally {
    await tablerizer.disconnect();
  }
}
export async function exportTable(
  schema: string,
  tableName: string,
  options: TablerizerOptions,
  outputPath?: string
): Promise<string> {
  const tablerizer = new Tablerizer(options);
  try {
    return await tablerizer.exportTable(schema, tableName, outputPath);
  } finally {
    await tablerizer.disconnect();
  }
}
