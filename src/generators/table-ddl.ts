import type {
  ColumnDefinition,
  PartitionInfo,
} from "../database.js";
import { escapeIdent } from "./utils.js";

/**
 * Generate DROP TABLE IF EXISTS ... CASCADE;
 */
export function generateDropTableSQL(
  schema: string,
  tableName: string,
): string[] {
  return [`DROP TABLE IF EXISTS ${schema}.${tableName} CASCADE;`];
}

/**
 * Generate CREATE TABLE statement with column definitions from pg_catalog.
 * Columns are listed in ordinal_position order (natural table order).
 * NOT NULL constraints are inline. All other constraints are separate.
 */
export function generateCreateTableSQL(
  schema: string,
  tableName: string,
  columns: ColumnDefinition[],
  partitionInfo: PartitionInfo | null,
): string[] {
  if (columns.length === 0) {
    return [`CREATE TABLE ${schema}.${tableName} ();`];
  }

  const lines: string[] = [];
  lines.push(`CREATE TABLE ${schema}.${tableName} (`);

  // Sort by ordinal_position (natural column order from pg_attribute)
  const sortedColumns = [...columns].sort(
    (a, b) => a.ordinal_position - b.ordinal_position,
  );

  const columnLines: string[] = [];
  for (const col of sortedColumns) {
    let line = `    ${escapeIdent(col.column_name)} ${col.data_type}`;

    if (col.not_null) {
      line += " NOT NULL";
    }

    if (col.column_default !== null && col.column_default !== undefined) {
      line += ` DEFAULT ${col.column_default}`;
    }

    columnLines.push(line);
  }

  // Join with commas, last line without comma
  for (let i = 0; i < columnLines.length; i++) {
    if (i < columnLines.length - 1) {
      lines.push(columnLines[i] + ",");
    } else {
      lines.push(columnLines[i]);
    }
  }

  // Close the CREATE TABLE with partition clause if applicable
  // pg_get_partkeydef() returns the full clause, e.g. "RANGE (sale_date)"
  if (partitionInfo) {
    lines.push(`) PARTITION BY ${partitionInfo.partition_key};`);
  } else {
    lines.push(`);`);
  }

  return lines;
}

/**
 * Generate ALTER TABLE ... OWNER TO ...;
 */
export function generateOwnerSQL(
  schema: string,
  tableName: string,
  owner: string,
): string[] {
  return [
    `ALTER TABLE ${schema}.${tableName} OWNER TO ${escapeIdent(owner)};`,
  ];
}
