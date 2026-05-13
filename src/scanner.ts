import type { DatabaseConnection, FunctionInfo, MaterializedViewInfo } from "./database.js";
import type { ExportScope } from "./config.js";
import * as queries from "./queries.js";

export type ObjectDescriptor =
  | { schema: string; name: string; objectType: "table" }
  | { schema: string; name: string; objectType: "function"; functionInfo: FunctionInfo }
  | { schema: string; name: string; objectType: "materialized-view"; matviewInfo: MaterializedViewInfo };

export async function scan(
  connection: DatabaseConnection,
  schemas: string[],
  scope: ExportScope[],
): Promise<ObjectDescriptor[]> {
  const descriptors: ObjectDescriptor[] = [];

  for (const schema of schemas) {
    if (scope.includes("tables")) {
      const tables = await queries.getTables(connection, schema);
      for (const t of tables) {
        descriptors.push({ schema, name: t.table_name, objectType: "table" });
      }
    }

    if (scope.includes("functions")) {
      const functions = await queries.getFunctions(connection, schema);
      for (const f of functions) {
        descriptors.push({ schema, name: f.function_name, objectType: "function", functionInfo: f });
      }
    }

    if (scope.includes("materialized-views")) {
      const matviews = await queries.getMaterializedViews(connection, schema);
      for (const mv of matviews) {
        descriptors.push({ schema, name: mv.matview_name, objectType: "materialized-view", matviewInfo: mv });
      }
    }
  }

  return descriptors;
}
