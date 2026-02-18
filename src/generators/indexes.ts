import type { IndexDefinition } from "../database.js";
import { escapeIdent } from "./utils.js";

/**
 * Generate idempotent index statements:
 *   DROP INDEX IF EXISTS ...;
 *   CREATE INDEX ...;
 *
 * Sorted by index name. Excludes indexes backing constraints (handled by generateConstraintsSQL).
 */
export function generateIndexesSQL(
  schema: string,
  indexes: IndexDefinition[],
): string[] {
  if (indexes.length === 0) return [];

  const sqlStatements: string[] = [];

  // Sort by index name for deterministic output
  const sorted = [...indexes].sort((a, b) =>
    a.index_name.localeCompare(b.index_name),
  );

  for (const idx of sorted) {
    sqlStatements.push(
      `DROP INDEX IF EXISTS ${schema}.${escapeIdent(idx.index_name)};`,
    );
    sqlStatements.push(`${idx.index_definition};`);
  }

  return sqlStatements;
}
