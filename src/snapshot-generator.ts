import type { DatabaseConnection } from "./database.js";
import type { ObjectDescriptor } from "./scanner.js";
import * as queries from "./queries.js";
import { generateTableSQL, generateFunctionSQL, generateMaterializedViewSQL } from "./generators/index.js";

export interface SnapshotOptions {
  roles?: string[];
  role_mappings?: Record<string, string>;
  include_date?: boolean;
}

export async function generateSnapshot(
  connection: DatabaseConnection,
  descriptor: ObjectDescriptor,
  options: SnapshotOptions,
): Promise<string> {
  switch (descriptor.objectType) {
    case "table": {
      const tableData = await queries.getTableData(
        connection, descriptor.schema, descriptor.name, options.roles,
      );
      return generateTableSQL(
        descriptor.schema, tableData, options.role_mappings, options.include_date,
      );
    }
    case "function": {
      return generateFunctionSQL(
        descriptor.functionInfo, options.roles, options.role_mappings, options.include_date,
      );
    }
    case "materialized-view": {
      const grants = await queries.getGrants(
        connection, descriptor.schema, descriptor.name, "table", options.roles,
      );
      const indexes = await queries.getMaterializedViewIndexes(
        connection, descriptor.schema, descriptor.name,
      );
      return generateMaterializedViewSQL(
        descriptor.matviewInfo, grants, indexes, options.role_mappings, options.include_date,
      );
    }
  }
}
