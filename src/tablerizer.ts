/**
 * Main Tablerizer class - PostgreSQL Table Export Wizard
 */

import fs from "fs/promises";
import path from "path";
import type { DatabaseConnection } from "./database.js";
import { createConnection } from "./database.js";
import type { TablerizerOptions, ExportScope } from "./config.js";
import { validateConfig, resolveConfig } from "./config.js";
import {
  generateTableSQL,
  generateFunctionSQL,
  generateMaterializedViewSQL,
  applyRoleMappings,
} from "./generators/index.js";
import * as queries from "./queries.js";

export interface ExportResult {
  schemas: string[];
  totalFiles: number;
  outputPath: string;
  tableFiles: number;
  functionFiles: number;
  materializedViewFiles: number;
  files: Array<{
    schema: string;
    name: string;
    type: "table" | "function" | "materialized-view";
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
 * Utility function for conditional logging
 */
function conditionalLog(message: string, silent: boolean): void {
  if (!silent) {
    console.log(message);
  }
}

/**
 * Main Tablerizer class for exporting PostgreSQL table permissions and schemas
 */
export class Tablerizer {
  private connection: DatabaseConnection | null = null;
  private options: TablerizerOptions;

  constructor(options: Partial<TablerizerOptions> = {}) {
    this.options = resolveConfig({ cli: options });
  }

  configure(options: Partial<TablerizerOptions>): void {
    this.options = resolveConfig({ file: this.options, cli: options });
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
    let materializedViewFiles = 0;

    // Determine what to export based on scope
    const scope = this.normalizeScope(this.options.scope);
    const exportTables = scope.includes("tables");
    const exportFunctions = scope.includes("functions");
    const exportMaterializedViews = scope.includes("materialized-views");

    // Clean output directory if requested
    if (this.options.clean !== false) {
      // Default: true
      try {
        await fs.rm(baseOutputDir, { recursive: true, force: true });
      } catch (error) {
        // Directory might not exist, that's ok
      }
    }

    // Ensure base output directory exists
    await fs.mkdir(baseOutputDir, { recursive: true });

    for (const schema of this.options.schemas) {
      const schemaOutputDir = path.join(baseOutputDir, schema);
      await fs.mkdir(schemaOutputDir, { recursive: true });

      let progressCounter = 0;
      let totalItems = 0;

      // Count total items for progress reporting
      if (exportTables) {
        const tables = await queries.getTables(this.connection!, schema);
        totalItems += tables.length;
      }
      if (exportFunctions) {
        const functions = await queries.getFunctions(this.connection!, schema);
        totalItems += functions.length;
      }
      if (exportMaterializedViews) {
        const matviews = await queries.getMaterializedViews(this.connection!, schema);
        totalItems += matviews.length;
      }

      // Export tables
      if (exportTables) {
        const tables = await queries.getTables(this.connection!, schema);

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
          const tableData = await queries.getTableData(this.connection!, schema, table.table_name, this.options.roles);

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
        const functions = await queries.getFunctions(this.connection!, schema);

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

      // Export materialized views
      if (exportMaterializedViews) {
        const matviews = await queries.getMaterializedViews(this.connection!, schema);

        for (const matview of matviews) {
          progressCounter++;

          // Report progress
          if (progressCallback) {
            progressCallback({
              schema,
              table: matview.matview_name, // Using table field for compatibility
              progress: progressCounter,
              total: totalItems,
            });
          }

          // Get materialized view grants and indexes
          const grants = await queries.getMaterializedViewGrants(
            this.connection!,
            schema,
            matview.matview_name,
            this.options.roles
          );
          const indexes = await queries.getMaterializedViewIndexes(
            this.connection!,
            schema,
            matview.matview_name
          );

          // Generate SQL content (documentation and grants only)
          const sqlContent = generateMaterializedViewSQL(
            matview,
            grants,
            indexes,
            this.options.role_mappings,
            this.options.include_date
          );

          // Write file
          const fileName = `${matview.matview_name}.sql`;
          const filePath = path.join(
            schemaOutputDir,
            "materialized-views",
            fileName
          );
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, sqlContent);

          files.push({
            schema,
            name: matview.matview_name,
            type: "materialized-view" as any,
            filePath,
            size: sqlContent.length,
          });
          totalFiles++;
          materializedViewFiles++;
        }
      }
    }

    return {
      schemas: this.options.schemas,
      totalFiles,
      tableFiles,
      functionFiles,
      materializedViewFiles,
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
    const tableData = await queries.getTableData(this.connection!, schema, tableName, this.options.roles);

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
    const functions = await queries.getFunctions(this.connection!, schema);
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
      return ["tables", "functions", "views", "materialized-views"];
    }
    if (Array.isArray(scope)) {
      return scope;
    }
    return [scope];
  }
}
