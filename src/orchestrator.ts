import fs from "fs/promises";
import path from "path";
import type { DatabaseConnection } from "./database.js";
import type { ExportScope } from "./config.js";
import type { ExportResult, ProgressCallback } from "./tablerizer.js";
import { scan } from "./scanner.js";
import { generateTableSQL, generateFunctionSQL, generateMaterializedViewSQL, applyRoleMappings } from "./generators/index.js";
import { writeSnapshots } from "./writer.js";

export interface ExportPipelineOptions {
  connection: DatabaseConnection;
  schemas: string[];
  scope: ExportScope[];
  out: string;
  clean: boolean;
  roles?: string[];
  role_mappings?: Record<string, string>;
  include_date?: boolean;
  progressCallback?: ProgressCallback;
}

const OBJECT_TYPE_DIR: Record<string, string> = {
  "table": "tables",
  "function": "functions",
  "materialized-view": "materialized-views",
};

export async function runExport(options: ExportPipelineOptions): Promise<ExportResult> {
  const baseOutputDir = options.out;

  if (options.clean) {
    try {
      await fs.rm(baseOutputDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  }

  await fs.mkdir(baseOutputDir, { recursive: true });

  const descriptors = await scan(options.connection, options.schemas, options.scope, options.roles);

  const files: ExportResult["files"] = [];
  let tableFiles = 0;
  let functionFiles = 0;
  let materializedViewFiles = 0;

  for (let i = 0; i < descriptors.length; i++) {
    const descriptor = descriptors[i];

    if (options.progressCallback) {
      options.progressCallback({
        schema: descriptor.schema,
        table: descriptor.name,
        progress: i + 1,
        total: descriptors.length,
      });
    }

    let sql: string;
    switch (descriptor.objectType) {
      case "table":
        sql = generateTableSQL(descriptor.schema, descriptor.data, options.include_date);
        break;
      case "function":
        sql = generateFunctionSQL(descriptor.data, options.include_date);
        break;
      case "materialized-view":
        sql = generateMaterializedViewSQL(descriptor.data, options.include_date);
        break;
    }

    if (options.role_mappings && Object.keys(options.role_mappings).length > 0) {
      sql = applyRoleMappings(sql, options.role_mappings);
    }

    const dir = OBJECT_TYPE_DIR[descriptor.objectType];
    let fileName = `${descriptor.name}.sql`;
    let filePath = path.join(baseOutputDir, descriptor.schema, dir, fileName);

    // Deduplicate filenames for overloaded functions
    let counter = 1;
    while (files.some(f => f.filePath === filePath)) {
      fileName = `${descriptor.name}_${counter}.sql`;
      filePath = path.join(baseOutputDir, descriptor.schema, dir, fileName);
      counter++;
    }

    await writeSnapshots([{ filePath, content: sql }]);

    files.push({
      schema: descriptor.schema,
      name: descriptor.name,
      type: descriptor.objectType,
      filePath,
      size: sql.length,
    });

    switch (descriptor.objectType) {
      case "table": tableFiles++; break;
      case "function": functionFiles++; break;
      case "materialized-view": materializedViewFiles++; break;
    }
  }

  return {
    schemas: options.schemas,
    totalFiles: files.length,
    tableFiles,
    functionFiles,
    materializedViewFiles,
    outputPath: path.resolve(baseOutputDir),
    files,
  };
}
