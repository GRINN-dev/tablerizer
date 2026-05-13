import type { DatabaseConnection, FunctionInfo, MaterializedViewInfo } from "./database.js";
import type { ExportScope } from "./config.js";
import type { TableData } from "./generators/types.js";
import * as queries from "./queries.js";

export interface FunctionData {
  info: FunctionInfo;
  grantRoles: string[];
}

export interface MaterializedViewData {
  info: MaterializedViewInfo;
  grants: Array<{
    grantor: string;
    grantee: string;
    privilege: string;
    is_grantable: boolean;
  }>;
  indexes: Array<{
    index_name: string;
    index_definition: string;
  }>;
}

export type ObjectDescriptor =
  | { schema: string; name: string; objectType: "table"; data: TableData }
  | { schema: string; name: string; objectType: "function"; data: FunctionData }
  | { schema: string; name: string; objectType: "materialized-view"; data: MaterializedViewData };

const HYDRATION_CONCURRENCY = 2;

async function parallel<T>(fns: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results = new Array<T>(fns.length);
  let next = 0;

  async function worker() {
    while (next < fns.length) {
      const i = next++;
      results[i] = await fns[i]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, fns.length) }, () => worker()),
  );
  return results;
}

export async function scan(
  connection: DatabaseConnection,
  schemas: string[],
  scope: ExportScope[],
  roles?: string[],
): Promise<ObjectDescriptor[]> {
  // Phase 1: List all objects across all schemas in parallel
  type Listing =
    | { schema: string; kind: "tables"; items: { table_name: string }[] }
    | { schema: string; kind: "functions"; items: FunctionInfo[] }
    | { schema: string; kind: "matviews"; items: MaterializedViewInfo[] };

  const listingPromises: Promise<Listing>[] = [];

  for (const schema of schemas) {
    if (scope.includes("tables")) {
      listingPromises.push(
        queries.getTables(connection, schema)
          .then(items => ({ schema, kind: "tables" as const, items })),
      );
    }
    if (scope.includes("functions")) {
      listingPromises.push(
        queries.getFunctions(connection, schema)
          .then(items => ({ schema, kind: "functions" as const, items })),
      );
    }
    if (scope.includes("materialized-views")) {
      listingPromises.push(
        queries.getMaterializedViews(connection, schema)
          .then(items => ({ schema, kind: "matviews" as const, items })),
      );
    }
  }

  const listings = await Promise.all(listingPromises);

  // Phase 2: Hydrate objects with bounded concurrency
  // Each table hydration fires 9 queries internally (getTableData uses Promise.all),
  // so HYDRATION_CONCURRENCY of 5 means ~45 concurrent queries at peak.
  const hydrationFns: (() => Promise<ObjectDescriptor>)[] = [];

  for (const listing of listings) {
    switch (listing.kind) {
      case "tables":
        for (const t of listing.items) {
          const schema = listing.schema;
          const name = t.table_name;
          hydrationFns.push(() =>
            queries.getTableData(connection, schema, name, roles)
              .then(data => ({ schema, name, objectType: "table" as const, data })),
          );
        }
        break;
      case "functions":
        for (const f of listing.items) {
          const schema = listing.schema;
          hydrationFns.push(() =>
            Promise.resolve({
              schema,
              name: f.function_name,
              objectType: "function" as const,
              data: { info: f, grantRoles: roles ?? [] },
            }),
          );
        }
        break;
      case "matviews":
        for (const mv of listing.items) {
          const schema = listing.schema;
          const name = mv.matview_name;
          hydrationFns.push(() =>
            Promise.all([
              queries.getGrants(connection, schema, name, "table", roles),
              queries.getMaterializedViewIndexes(connection, schema, name),
            ]).then(([grants, indexes]) => ({
              schema,
              name,
              objectType: "materialized-view" as const,
              data: { info: mv, grants, indexes },
            })),
          );
        }
        break;
    }
  }

  return parallel(hydrationFns, HYDRATION_CONCURRENCY);
}
