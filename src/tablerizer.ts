/**
 * Main Tablerizer class - PostgreSQL Table Export Wizard
 */

import fs from "fs/promises";
import path from "path";
import { createConnection } from "./database.js";
import type { TablerizerOptions, ExportScope } from "./config.js";
import { validateConfig, resolveConfig } from "./config.js";
import { generateTableSQL, generateFunctionSQL } from "./generators/index.js";
import * as queries from "./queries.js";
import { runExport } from "./orchestrator.js";

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

    return runExport({
      connection: this.connection!,
      schemas: this.options.schemas,
      scope: this.normalizeScope(this.options.scope),
      out: this.options.out || "./tables",
      clean: this.options.clean !== false,
      roles: this.options.roles,
      role_mappings: this.options.role_mappings,
      include_date: this.options.include_date,
      progressCallback,
    });
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
