import type { ColumnDefinition } from "../../lib/database.js";

export function join(lines: string[]): string {
  return lines.join("\n");
}

export const cols: ColumnDefinition[] = [
  { column_name: "id", data_type: "integer", not_null: true, column_default: "nextval('s'::regclass)", comment: null, ordinal_position: 1 },
  { column_name: "name", data_type: "text", not_null: true, column_default: null, comment: "The name", ordinal_position: 2 },
  { column_name: "active", data_type: "boolean", not_null: false, column_default: "true", comment: null, ordinal_position: 3 },
];
