import type { ConstraintDefinition } from "../database.js";
import { escapeIdent } from "./utils.js";

/**
 * Generate idempotent constraint statements:
 *   ALTER TABLE ... DROP CONSTRAINT IF EXISTS ...;
 *   ALTER TABLE ... ADD CONSTRAINT ... <definition>;
 *
 * Sorted by type (PK, UNIQUE, FK, CHECK, EXCLUSION), then by name.
 * Filters out system-generated NOT NULL check constraints.
 */
export function generateConstraintsSQL(
  schema: string,
  tableName: string,
  constraints: ConstraintDefinition[],
): string[] {
  if (constraints.length === 0) return [];

  const sqlStatements: string[] = [];

  // Filter out system-generated NOT NULL constraints (they're inline in CREATE TABLE)
  // These typically have names like "tablename_columnname_not_null" and definition "CHECK ((col IS NOT NULL))"
  const userConstraints = constraints.filter((c) => {
    // Skip system-generated check constraints with numeric prefixes
    if (/^\d+_\d+_\d+_.+/.test(c.constraint_name)) return false;
    return true;
  });

  // Already sorted by type then name from the query, but ensure determinism
  const sorted = [...userConstraints].sort((a, b) => {
    const typeOrder: Record<string, number> = {
      p: 1,
      u: 2,
      f: 3,
      c: 4,
      x: 5,
    };
    const typeA = typeOrder[a.constraint_type] ?? 99;
    const typeB = typeOrder[b.constraint_type] ?? 99;
    if (typeA !== typeB) return typeA - typeB;
    return a.constraint_name.localeCompare(b.constraint_name);
  });

  for (const constraint of sorted) {
    const constraintTypeName = {
      p: "PRIMARY KEY",
      u: "UNIQUE",
      f: "FOREIGN KEY",
      c: "CHECK",
      x: "EXCLUSION",
    }[constraint.constraint_type] || constraint.constraint_type;

    sqlStatements.push(
      `-- ${constraintTypeName}: ${constraint.constraint_name}`,
    );
    sqlStatements.push(
      `ALTER TABLE ${schema}.${tableName} DROP CONSTRAINT IF EXISTS ${escapeIdent(constraint.constraint_name)};`,
    );
    sqlStatements.push(
      `ALTER TABLE ${schema}.${tableName} ADD CONSTRAINT ${escapeIdent(constraint.constraint_name)} ${constraint.definition};`,
    );
  }

  return sqlStatements;
}
