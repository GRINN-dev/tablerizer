import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scan, scanTable, scanFunction, type ObjectDescriptor } from "../../src/scanner.js";
import type { DatabaseConnection, FunctionInfo, MaterializedViewInfo } from "../../src/database.js";

function mockConnection(data: {
  tables?: { table_name: string }[];
  functions?: Partial<FunctionInfo>[];
  materializedViews?: Partial<MaterializedViewInfo>[];
  tableInfo?: Record<string, any>;
  matviewGrants?: any[];
  matviewIndexes?: any[];
}): DatabaseConnection {
  return {
    connect: async () => {},
    disconnect: async () => {},
    query: async (text: string, params?: any[]) => {
      // getTables listing
      if (text.includes("relname as table_name") && !text.includes("pg_index")) {
        return data.tables ?? [];
      }
      // getFunctions listing
      if (text.includes("pg_proc")) return data.functions ?? [];
      // getMaterializedViews listing
      if (text.includes("relkind = 'm'") && !text.includes("pg_index")) {
        return data.materializedViews ?? [];
      }
      // getTableData - table info query
      if (text.includes("relrowsecurity")) {
        return [{
          oid: 1, owner: "postgres", relrowsecurity: false,
          relforcerowsecurity: false, relkind: "r",
        }];
      }
      // getColumnDefinitions
      if (text.includes("pg_attribute")) {
        return [{
          column_name: "id", data_type: "integer", not_null: true,
          column_default: null, comment: null, ordinal_position: 1,
        }];
      }
      // getMaterializedViewIndexes
      if (text.includes("pg_index") && text.includes("relkind = 'm'")) {
        return data.matviewIndexes ?? [];
      }
      // getGrants - table_privileges
      if (text.includes("table_privileges")) return data.matviewGrants ?? [];
      // Default empty for grants, policies, triggers, constraints, indexes, comments
      return [];
    },
  };
}

function fakeFunctionInfo(name: string, args = ""): FunctionInfo {
  return {
    schema_name: "app_public",
    function_name: name,
    function_signature: "",
    function_definition: `CREATE FUNCTION ${name}() RETURNS void`,
    return_type: "void",
    language: "plpgsql",
    volatility: "VOLATILE",
    security_definer: false,
    function_arguments: args,
    function_type: "FUNCTION",
    is_security_definer: false,
    comment: null,
  };
}

function fakeMatviewInfo(name: string): MaterializedViewInfo {
  return {
    schema_name: "app_public",
    matview_name: name,
    definition: "SELECT 1",
    owner: "postgres",
    comment: null,
    is_populated: true,
  };
}

describe("scan", () => {
  it("returns hydrated table descriptors when scope includes tables", async () => {
    const conn = mockConnection({
      tables: [{ table_name: "users" }, { table_name: "posts" }],
    });

    const result = await scan(conn, ["app_public"], ["tables"]);

    assert.equal(result.length, 2);
    assert.equal(result[0].objectType, "table");
    assert.equal(result[0].name, "users");
    assert.equal(result[0].schema, "app_public");
    const first = result[0] as Extract<ObjectDescriptor, { objectType: "table" }>;
    assert.equal(first.data.table, "users");
    assert.equal(first.data.owner, "postgres");
  });

  it("returns function descriptors with FunctionData when scope includes functions", async () => {
    const auth = fakeFunctionInfo("authenticate", "email text, password text");
    const userId = fakeFunctionInfo("current_user_id");
    const conn = mockConnection({ functions: [auth, userId] });

    const result = await scan(conn, ["app_public"], ["functions"]);

    assert.equal(result.length, 2);
    assert.equal(result[0].objectType, "function");
    assert.equal(result[0].name, "authenticate");
    const first = result[0] as Extract<ObjectDescriptor, { objectType: "function" }>;
    assert.equal(first.data.info.function_arguments, "email text, password text");
    assert.deepStrictEqual(first.data.grantRoles, []);
  });

  it("passes roles to function descriptors as grantRoles", async () => {
    const conn = mockConnection({ functions: [fakeFunctionInfo("do_thing")] });

    const result = await scan(conn, ["app_public"], ["functions"], ["app_user", "admin"]);

    const first = result[0] as Extract<ObjectDescriptor, { objectType: "function" }>;
    assert.deepStrictEqual(first.data.grantRoles, ["app_user", "admin"]);
  });

  it("returns materialized view descriptors with grants and indexes", async () => {
    const stats = fakeMatviewInfo("user_stats");
    const conn = mockConnection({
      materializedViews: [stats],
      matviewGrants: [
        { grantor: "postgres", grantee: "app_user", privilege: "SELECT", is_grantable: false },
      ],
      matviewIndexes: [
        { index_name: "idx_stats", index_definition: "CREATE INDEX idx_stats ON app_public.user_stats (id)" },
      ],
    });

    const result = await scan(conn, ["app_public"], ["materialized-views"]);

    assert.equal(result.length, 1);
    assert.equal(result[0].objectType, "materialized-view");
    const first = result[0] as Extract<ObjectDescriptor, { objectType: "materialized-view" }>;
    assert.equal(first.data.info.matview_name, "user_stats");
    assert.equal(first.data.grants.length, 1);
    assert.equal(first.data.grants[0].grantee, "app_user");
    assert.equal(first.data.indexes.length, 1);
    assert.equal(first.data.indexes[0].index_name, "idx_stats");
  });

  it("only returns object types included in scope", async () => {
    const conn = mockConnection({
      tables: [{ table_name: "users" }],
      functions: [fakeFunctionInfo("authenticate")],
      materializedViews: [fakeMatviewInfo("user_stats")],
    });

    const result = await scan(conn, ["app_public"], ["tables"]);

    assert.equal(result.length, 1);
    assert.equal(result[0].objectType, "table");
  });

  it("scans across multiple schemas", async () => {
    const conn = mockConnection({
      tables: [{ table_name: "users" }],
    });

    const result = await scan(conn, ["app_public", "app_private"], ["tables"]);

    assert.equal(result.length, 2);
    assert.equal(result[0].schema, "app_public");
    assert.equal(result[1].schema, "app_private");
  });
});

describe("scanFunction", () => {
  it("returns FunctionData with roles passed through as grantRoles", async () => {
    const conn = mockConnection({
      functions: [fakeFunctionInfo("authenticate", "email text, password text")],
    });

    const data = await scanFunction(conn, "app_public", "authenticate", ["app_user", "admin"]);

    assert.equal(data.info.function_name, "authenticate");
    assert.equal(data.info.function_arguments, "email text, password text");
    assert.deepStrictEqual(data.grantRoles, ["app_user", "admin"]);
  });

  it("throws when function name is not found", async () => {
    const conn = mockConnection({ functions: [fakeFunctionInfo("authenticate")] });

    await assert.rejects(
      () => scanFunction(conn, "app_public", "nonexistent"),
      { message: "Function app_public.nonexistent not found" },
    );
  });
});

describe("scanTable", () => {
  it("returns hydrated TableData for a named table", async () => {
    const conn = mockConnection({});
    const data = await scanTable(conn, "app_public", "users");

    assert.equal(data.table, "users");
    assert.equal(data.owner, "postgres");
    assert.ok(Array.isArray(data.column_definitions));
    assert.equal(data.column_definitions.length, 1);
    assert.equal(data.column_definitions[0].column_name, "id");
  });
});
