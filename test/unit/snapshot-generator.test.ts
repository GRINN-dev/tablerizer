import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSnapshot } from "../../src/snapshot-generator.js";
import type { DatabaseConnection, FunctionInfo, MaterializedViewInfo } from "../../src/database.js";
import type { ObjectDescriptor } from "../../src/scanner.js";

function mockConnection(responses: Record<string, any[]>): DatabaseConnection {
  return {
    connect: async () => {},
    disconnect: async () => {},
    query: async (text: string) => {
      for (const [pattern, data] of Object.entries(responses)) {
        if (text.includes(pattern)) return data;
      }
      return [];
    },
  };
}

function fakeFunctionInfo(name: string): FunctionInfo {
  return {
    schema_name: "app_public",
    function_name: name,
    function_signature: "",
    function_definition: `CREATE OR REPLACE FUNCTION app_public.${name}()\n RETURNS void\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  -- noop\nEND;\n$function$`,
    return_type: "void",
    language: "plpgsql",
    volatility: "VOLATILE",
    security_definer: false,
    function_arguments: "",
    function_type: "FUNCTION",
    is_security_definer: false,
    comment: null,
  };
}

describe("generateSnapshot", () => {
  it("generates SQL for a table descriptor", async () => {
    const conn = mockConnection({
      "relrowsecurity": [{
        oid: 1, owner: "postgres", relrowsecurity: false,
        relforcerowsecurity: false, relkind: "r",
      }],
      "pg_attribute": [{
        column_name: "id", data_type: "integer", not_null: true,
        column_default: null, comment: null, ordinal_position: 1,
      }],
      "table_privileges": [],
      "column_privileges": [],
      "pg_policies": [],
      "information_schema.triggers": [],
      "pg_constraint": [],
      "pg_index": [],
      "obj_description": [{ comment: null }],
    });

    const descriptor: ObjectDescriptor = {
      schema: "app_public", name: "users", objectType: "table",
    };

    const sql = await generateSnapshot(conn, descriptor, {});

    assert.ok(sql.includes("Table: app_public.users"));
    assert.ok(sql.includes("CREATE TABLE"));
  });

  it("generates SQL for a function descriptor using carried functionInfo", async () => {
    const conn = mockConnection({});
    const funcInfo = fakeFunctionInfo("authenticate");

    const descriptor: ObjectDescriptor = {
      schema: "app_public", name: "authenticate",
      objectType: "function", functionInfo: funcInfo,
    };

    const sql = await generateSnapshot(conn, descriptor, {});

    assert.ok(sql.includes("Function: app_public.authenticate"));
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION"));
  });

  it("generates SQL for a materialized view descriptor", async () => {
    const conn = mockConnection({
      "table_privileges": [
        { grantor: "postgres", grantee: "app_user", privilege: "SELECT", is_grantable: false },
      ],
      "pg_index": [
        { index_name: "idx_stats", index_definition: "CREATE INDEX idx_stats ON app_public.user_stats (id)" },
      ],
    });

    const matviewInfo: MaterializedViewInfo = {
      schema_name: "app_public",
      matview_name: "user_stats",
      definition: "SELECT count(*) FROM users",
      owner: "postgres",
      comment: null,
      is_populated: true,
    };

    const descriptor: ObjectDescriptor = {
      schema: "app_public", name: "user_stats",
      objectType: "materialized-view", matviewInfo,
    };

    const sql = await generateSnapshot(conn, descriptor, {});

    assert.ok(sql.includes("Materialized View: app_public.user_stats"));
    assert.ok(sql.includes("GRANT SELECT"));
  });
});
