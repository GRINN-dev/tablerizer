import { createConnection } from "./database.js";
import type { DatabaseConnection } from "./database.js";
import type { TablerizerOptions } from "./config.js";
import { validateConfig, resolveConfig, normalizeScope } from "./config.js";
import { generateTableSQL, generateFunctionSQL, applyRoleMappings } from "./generators/index.js";
import { scanTable, scanFunction } from "./scanner.js";
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

export class Tablerizer {
  private connection: DatabaseConnection | null = null;
  private options: TablerizerOptions;

  constructor(options: Partial<TablerizerOptions> = {}) {
    this.options = resolveConfig({ cli: options });
  }

  configure(options: Partial<TablerizerOptions>): void {
    this.options = resolveConfig({ file: this.options, cli: options });
  }

  async connect(connectionString?: string): Promise<void> {
    const dbUrl = connectionString || this.options.database_url;
    if (!dbUrl) {
      throw new Error("Database connection string is required");
    }

    this.connection = createConnection(dbUrl);
    await this.connection.connect();
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = null;
    }
  }

  async export(progressCallback?: ProgressCallback): Promise<ExportResult> {
    validateConfig(this.options);

    if (!this.connection) {
      await this.connect();
    }

    return runExport({
      connection: this.connection!,
      schemas: this.options.schemas,
      scope: normalizeScope(this.options.scope),
      out: this.options.out || "./tables",
      clean: this.options.clean !== false,
      roles: this.options.roles,
      role_mappings: this.options.role_mappings,
      include_date: this.options.include_date,
      progressCallback,
    });
  }

  async exportTable(schema: string, tableName: string): Promise<string> {
    validateConfig(this.options);

    if (!this.connection) {
      await this.connect();
    }

    const tableData = await scanTable(this.connection!, schema, tableName, this.options.roles);
    let sql = generateTableSQL(schema, tableData, this.options.include_date);

    if (this.options.role_mappings && Object.keys(this.options.role_mappings).length > 0) {
      sql = applyRoleMappings(sql, this.options.role_mappings);
    }

    return sql;
  }

  async exportFunction(schema: string, functionName: string): Promise<string> {
    validateConfig(this.options);

    if (!this.connection) {
      await this.connect();
    }

    const functionData = await scanFunction(this.connection!, schema, functionName, this.options.roles);
    let sql = generateFunctionSQL(functionData, this.options.include_date);

    if (this.options.role_mappings && Object.keys(this.options.role_mappings).length > 0) {
      sql = applyRoleMappings(sql, this.options.role_mappings);
    }

    return sql;
  }

}
