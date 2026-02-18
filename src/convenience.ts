/**
 * Convenience functions for quick Tablerizer usage.
 */

import type { TablerizerOptions } from "./config.js";
import { Tablerizer } from "./tablerizer.js";
import type { ExportResult, ProgressCallback } from "./tablerizer.js";

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
