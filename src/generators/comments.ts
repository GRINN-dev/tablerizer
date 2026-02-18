import type { ColumnDefinition, IndexDefinition } from "../database.js";
import { escapeIdent } from "./utils.js";

/**
 * Generate COMMENT ON TABLE and COMMENT ON COLUMN statements.
 * Sorted: table comment first, then columns by ordinal_position.
 */
export function generateCommentsSQL(
  schema: string,
  tableName: string,
  tableComment: string | undefined,
  columns: ColumnDefinition[],
): string[] {
  const sqlStatements: string[] = [];

  if (tableComment) {
    const escapedComment = tableComment.includes("'")
      ? `$$${tableComment}$$`
      : `'${tableComment}'`;
    sqlStatements.push(
      `COMMENT ON TABLE ${schema}.${tableName} IS ${escapedComment};`,
    );
  }

  // Column comments, sorted by ordinal_position (natural order)
  const columnsWithComments = [...columns]
    .filter((c) => c.comment)
    .sort((a, b) => a.ordinal_position - b.ordinal_position);

  for (const col of columnsWithComments) {
    const escapedComment = col.comment!.includes("'")
      ? `$$${col.comment}$$`
      : `'${col.comment}'`;
    sqlStatements.push(
      `COMMENT ON COLUMN ${schema}.${tableName}.${escapeIdent(col.column_name)} IS ${escapedComment};`,
    );
  }

  return sqlStatements;
}

/**
 * Generate COMMENT ON INDEX statements for indexes that have comments.
 */
export function generateIndexCommentsSQL(
  schema: string,
  indexes: IndexDefinition[],
): string[] {
  const sqlStatements: string[] = [];

  const indexesWithComments = [...indexes]
    .filter((idx) => idx.comment)
    .sort((a, b) => a.index_name.localeCompare(b.index_name));

  for (const idx of indexesWithComments) {
    const escapedComment = idx.comment!.includes("'")
      ? `$$${idx.comment}$$`
      : `'${idx.comment}'`;
    sqlStatements.push(
      `COMMENT ON INDEX ${schema}.${escapeIdent(idx.index_name)} IS ${escapedComment};`,
    );
  }

  return sqlStatements;
}
