import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scan, type ObjectDescriptor } from "../../src/scanner.js";
import type { DatabaseConnection, FunctionInfo, MaterializedViewInfo } from "../../src/database.js";

function mockConnection(data: {
  tables?: { table_name: string }[];
  functions?: Partial<FunctionInfo>[];
  materializedViews?: Partial<MaterializedViewInfo>[];
}): DatabaseConnection {
  return {
    connect: async () => {},
    disconnect: async () => {},
    query: async (text: string) => {
      if (text.includes("relkind = 'r'")) return data.tables ?? [];
      if (text.includes("pg_proc")) return data.functions ?? [];
      if (text.includes("relkind = 'm'")) return data.materializedViews ?? [];
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
  it("returns table descriptors when scope includes tables", async () => {
    const conn = mockConnection({
      tables: [{ table_name: "users" }, { table_name: "posts" }],
    });

    const result = await scan(conn, ["app_public"], ["tables"]);

    assert.deepStrictEqual(result, [
      { schema: "app_public", name: "users", objectType: "table" },
      { schema: "app_public", name: "posts", objectType: "table" },
    ]);
  });

  it("returns function descriptors with functionInfo when scope includes functions", async () => {
    const auth = fakeFunctionInfo("authenticate", "email text, password text");
    const userId = fakeFunctionInfo("current_user_id");
    const conn = mockConnection({ functions: [auth, userId] });

    const result = await scan(conn, ["app_public"], ["functions"]);

    assert.equal(result.length, 2);
    assert.equal(result[0].objectType, "function");
    assert.equal(result[0].name, "authenticate");
    const first = result[0] as Extract<ObjectDescriptor, { objectType: "function" }>;
    assert.equal(first.functionInfo.function_arguments, "email text, password text");
  });

  it("returns materialized view descriptors with matviewInfo", async () => {
    const stats = fakeMatviewInfo("user_stats");
    const conn = mockConnection({ materializedViews: [stats] });

    const result = await scan(conn, ["app_public"], ["materialized-views"]);

    assert.equal(result.length, 1);
    assert.equal(result[0].objectType, "materialized-view");
    const first = result[0] as Extract<ObjectDescriptor, { objectType: "materialized-view" }>;
    assert.equal(first.matviewInfo.matview_name, "user_stats");
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
