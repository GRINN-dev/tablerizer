/**
 * Scanner tests — adaptés pour Effect-TS
 *
 * CONCEPT — Tester avec des services mockés (Layer.succeed)
 *
 * Avant : on passait un mock DatabaseConnection en argument.
 * Après : on crée un Layer mock et on le fournit avec Effect.provide.
 *
 * C'est le même principe que le DI dans les tests Java/Spring,
 * mais sans framework, sans annotations, juste le type system.
 *
 *   const mockLayer = Layer.succeed(DatabaseConnection, {
 *     query: (sql) => Effect.succeed(fakeData)
 *   })
 *
 *   const result = await Effect.runPromise(
 *     pipe(scan(...), Effect.provide(mockLayer))
 *   )
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect, Layer, pipe, Either } from "effect";
import { scan, scanTable, scanFunction, type ObjectDescriptor } from "../../src/scanner.js";
import { DatabaseConnection, type FunctionInfo, type MaterializedViewInfo } from "../../src/database.js";

function mockDatabaseLayer(data: {
  tables?: { table_name: string }[];
  functions?: Partial<FunctionInfo>[];
  materializedViews?: Partial<MaterializedViewInfo>[];
  tableInfo?: Record<string, any>;
  matviewGrants?: any[];
  matviewIndexes?: any[];
}) {
  return Layer.succeed(DatabaseConnection, {
    query: <T = any>(text: string, _params?: any[]) => {
      if (text.includes("relname as table_name") && !text.includes("pg_index")) {
        return Effect.succeed(data.tables ?? []) as Effect.Effect<T[], any>;
      }
      if (text.includes("pg_proc")) return Effect.succeed(data.functions ?? []) as Effect.Effect<T[], any>;
      if (text.includes("relkind = 'm'") && !text.includes("pg_index")) {
        return Effect.succeed(data.materializedViews ?? []) as Effect.Effect<T[], any>;
      }
      if (text.includes("relrowsecurity")) {
        return Effect.succeed([{
          oid: 1, owner: "postgres", relrowsecurity: false,
          relforcerowsecurity: false, relkind: "r",
        }]) as Effect.Effect<T[], any>;
      }
      if (text.includes("pg_attribute")) {
        return Effect.succeed([{
          column_name: "id", data_type: "integer", not_null: true,
          column_default: null, comment: null, ordinal_position: 1,
        }]) as Effect.Effect<T[], any>;
      }
      if (text.includes("pg_index") && text.includes("relkind = 'm'")) {
        return Effect.succeed(data.matviewIndexes ?? []) as Effect.Effect<T[], any>;
      }
      if (text.includes("table_privileges")) return Effect.succeed(data.matviewGrants ?? []) as Effect.Effect<T[], any>;
      return Effect.succeed([]) as Effect.Effect<T[], any>;
    },
  });
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

// Helper : exécute un Effect avec un mock database layer
function runWithMock<A, E>(
  effect: Effect.Effect<A, E, DatabaseConnection>,
  data: Parameters<typeof mockDatabaseLayer>[0],
): Promise<A> {
  return Effect.runPromise(pipe(effect, Effect.provide(mockDatabaseLayer(data))));
}

describe("scan", () => {
  it("returns hydrated table descriptors when scope includes tables", async () => {
    const result = await runWithMock(
      scan(["app_public"], ["tables"]),
      { tables: [{ table_name: "users" }, { table_name: "posts" }] },
    );

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
    const result = await runWithMock(
      scan(["app_public"], ["functions"]),
      { functions: [auth, userId] },
    );

    assert.equal(result.length, 2);
    assert.equal(result[0].objectType, "function");
    assert.equal(result[0].name, "authenticate");
    const first = result[0] as Extract<ObjectDescriptor, { objectType: "function" }>;
    assert.equal(first.data.info.function_arguments, "email text, password text");
    assert.deepStrictEqual(first.data.grantRoles, []);
  });

  it("passes roles to function descriptors as grantRoles", async () => {
    const result = await runWithMock(
      scan(["app_public"], ["functions"], ["app_user", "admin"]),
      { functions: [fakeFunctionInfo("do_thing")] },
    );

    const first = result[0] as Extract<ObjectDescriptor, { objectType: "function" }>;
    assert.deepStrictEqual(first.data.grantRoles, ["app_user", "admin"]);
  });

  it("returns materialized view descriptors with grants and indexes", async () => {
    const result = await runWithMock(
      scan(["app_public"], ["materialized-views"]),
      {
        materializedViews: [fakeMatviewInfo("user_stats")],
        matviewGrants: [
          { grantor: "postgres", grantee: "app_user", privilege: "SELECT", is_grantable: false },
        ],
        matviewIndexes: [
          { index_name: "idx_stats", index_definition: "CREATE INDEX idx_stats ON app_public.user_stats (id)" },
        ],
      },
    );

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
    const result = await runWithMock(
      scan(["app_public"], ["tables"]),
      {
        tables: [{ table_name: "users" }],
        functions: [fakeFunctionInfo("authenticate")],
        materializedViews: [fakeMatviewInfo("user_stats")],
      },
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].objectType, "table");
  });

  it("scans across multiple schemas", async () => {
    const result = await runWithMock(
      scan(["app_public", "app_private"], ["tables"]),
      { tables: [{ table_name: "users" }] },
    );

    assert.equal(result.length, 2);
    assert.equal(result[0].schema, "app_public");
    assert.equal(result[1].schema, "app_private");
  });
});

describe("scanFunction", () => {
  it("returns FunctionData with roles passed through as grantRoles", async () => {
    const data = await runWithMock(
      scanFunction("app_public", "authenticate", ["app_user", "admin"]),
      { functions: [fakeFunctionInfo("authenticate", "email text, password text")] },
    );

    assert.equal(data.info.function_name, "authenticate");
    assert.equal(data.info.function_arguments, "email text, password text");
    assert.deepStrictEqual(data.grantRoles, ["app_user", "admin"]);
  });

  it("fails with ScanError when function name is not found", async () => {
    // On utilise Effect.either pour capturer l'erreur sans throw
    const result = await Effect.runPromise(
      pipe(
        Effect.either(scanFunction("app_public", "nonexistent")),
        Effect.provide(mockDatabaseLayer({ functions: [fakeFunctionInfo("authenticate")] })),
      ),
    );

    assert.ok(Either.isLeft(result));
    if (Either.isLeft(result)) {
      assert.equal(result.left._tag, "ScanError");
      assert.ok(result.left.message.includes("nonexistent"));
    }
  });
});

describe("scanTable", () => {
  it("returns hydrated TableData for a named table", async () => {
    const data = await runWithMock(scanTable("app_public", "users"), {});

    assert.equal(data.table, "users");
    assert.equal(data.owner, "postgres");
    assert.ok(Array.isArray(data.column_definitions));
    assert.equal(data.column_definitions.length, 1);
    assert.equal(data.column_definitions[0].column_name, "id");
  });

  it("fails with ScanError when table is not found", async () => {
    const emptyLayer = Layer.succeed(DatabaseConnection, {
      query: <T = any>(_text: string, _params?: any[]) =>
        Effect.succeed([]) as Effect.Effect<T[], any>,
    });

    const result = await Effect.runPromise(
      pipe(
        Effect.either(scanTable("app_public", "nonexistent")),
        Effect.provide(emptyLayer),
      ),
    );

    assert.ok(Either.isLeft(result));
    if (Either.isLeft(result)) {
      assert.equal(result.left._tag, "ScanError");
      assert.ok(result.left.message.includes("nonexistent"));
    }
  });
});
