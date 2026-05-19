/**
 * Orchestrator tests — adaptés pour @effect/sql
 *
 * Même pattern que scanner.test.ts :
 *   1. Créer un Layer mock avec SqlClient.SqlClient
 *   2. Fournir le Layer (Effect.provide)
 *   3. Exécuter (Effect.runPromise)
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Effect, Layer, pipe } from "effect";
import { SqlClient } from "@effect/sql";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { runExport } from "../../src/orchestrator.js";
import type { ExportProgress } from "../../src/tablerizer.js";

function mockSqlLayer(queryFn: (text: string, params?: any[]) => any) {
  return Layer.succeed(SqlClient.SqlClient, {
    unsafe: <T = any>(text: string, params?: any[]) =>
      Effect.succeed(queryFn(text, params)) as Effect.Effect<T[], any>,
  } as any);
}

function defaultMockLayer(data: {
  tables?: { table_name: string }[];
}) {
  return mockSqlLayer((text) => {
    if (text.includes("relname as table_name") && !text.includes("pg_index")) {
      return data.tables ?? [];
    }
    if (text.includes("relrowsecurity")) {
      return [{
        oid: 1, owner: "postgres", relrowsecurity: false,
        relforcerowsecurity: false, relkind: "r",
      }];
    }
    if (text.includes("pg_attribute")) {
      return [{
        column_name: "id", data_type: "integer", not_null: true,
        column_default: null, comment: null, ordinal_position: 1,
      }];
    }
    return [];
  });
}

describe("runExport", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tablerizer-orch-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("exports a single table and returns correct ExportResult", async () => {
    const layer = defaultMockLayer({ tables: [{ table_name: "users" }] });

    const result = await Effect.runPromise(
      pipe(
        runExport({
          schemas: ["app_public"],
          scope: ["tables"],
          out: tmpDir,
          clean: false,
        }),
        Effect.provide(layer),
      ),
    );

    assert.equal(result.totalFiles, 1);
    assert.equal(result.tableFiles, 1);
    assert.equal(result.functionFiles, 0);
    assert.equal(result.materializedViewFiles, 0);
    assert.deepStrictEqual(result.schemas, ["app_public"]);

    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].name, "users");
    assert.equal(result.files[0].type, "table");
    assert.equal(result.files[0].schema, "app_public");

    const filePath = path.join(tmpDir, "app_public", "tables", "users.sql");
    const content = await fs.readFile(filePath, "utf-8");
    assert.ok(content.includes("Table: app_public.users"));
  });

  it("calls progress callback for each object", async () => {
    const layer = defaultMockLayer({
      tables: [{ table_name: "users" }, { table_name: "posts" }],
    });

    const progress: ExportProgress[] = [];
    await Effect.runPromise(
      pipe(
        runExport({
          schemas: ["app_public"],
          scope: ["tables"],
          out: tmpDir,
          clean: false,
          progressCallback: (p) => progress.push({ ...p }),
        }),
        Effect.provide(layer),
      ),
    );

    assert.equal(progress.length, 2);
    assert.equal(progress[0].table, "users");
    assert.equal(progress[0].progress, 1);
    assert.equal(progress[0].total, 2);
    assert.equal(progress[1].table, "posts");
    assert.equal(progress[1].progress, 2);
    assert.equal(progress[1].total, 2);
  });

  it("deduplicates filenames for overloaded functions", async () => {
    const funcInfo = {
      schema_name: "app_public",
      function_name: "authenticate",
      function_signature: "",
      function_definition: "CREATE OR REPLACE FUNCTION app_public.authenticate()\n RETURNS void\n LANGUAGE plpgsql\nAS $function$\nBEGIN\nEND;\n$function$",
      return_type: "void",
      language: "plpgsql",
      volatility: "VOLATILE",
      security_definer: false,
      function_arguments: "",
      function_type: "FUNCTION",
      is_security_definer: false,
      comment: null,
    };

    const layer = mockSqlLayer((text) => {
      if (text.includes("pg_proc")) {
        return [
          { ...funcInfo, function_arguments: "email text" },
          { ...funcInfo, function_arguments: "email text, password text" },
        ];
      }
      return [];
    });

    const result = await Effect.runPromise(
      pipe(
        runExport({
          schemas: ["app_public"],
          scope: ["functions"],
          out: tmpDir,
          clean: false,
        }),
        Effect.provide(layer),
      ),
    );

    assert.equal(result.files.length, 2);
    const fileNames = result.files.map((f) => path.basename(f.filePath));
    assert.ok(fileNames.includes("authenticate.sql"));
    assert.ok(fileNames.includes("authenticate_1.sql"));
  });

  it("applies role mappings to generated SQL", async () => {
    const layer = mockSqlLayer((text) => {
      if (text.includes("relname as table_name") && !text.includes("pg_index")) {
        return [{ table_name: "users" }];
      }
      if (text.includes("relrowsecurity")) {
        return [{
          oid: 1, owner: "postgres", relrowsecurity: false,
          relforcerowsecurity: false, relkind: "r",
        }];
      }
      if (text.includes("pg_attribute")) {
        return [{
          column_name: "id", data_type: "integer", not_null: true,
          column_default: null, comment: null, ordinal_position: 1,
        }];
      }
      if (text.includes("table_privileges")) {
        return [{
          grantor: "postgres", grantee: "visitor",
          privilege: "SELECT", is_grantable: false,
        }];
      }
      return [];
    });

    const result = await Effect.runPromise(
      pipe(
        runExport({
          schemas: ["app_public"],
          scope: ["tables"],
          out: tmpDir,
          clean: false,
          role_mappings: { visitor: ":VISITOR" },
        }),
        Effect.provide(layer),
      ),
    );

    const filePath = result.files[0].filePath;
    const content = await fs.readFile(filePath, "utf-8");
    assert.ok(content.includes(":VISITOR"));
  });

  it("cleans output directory when clean is true", async () => {
    const staleDir = path.join(tmpDir, "stale");
    await fs.mkdir(staleDir, { recursive: true });
    await fs.writeFile(path.join(staleDir, "old.sql"), "-- stale");

    const layer = defaultMockLayer({ tables: [] });

    await Effect.runPromise(
      pipe(
        runExport({
          schemas: ["app_public"],
          scope: ["tables"],
          out: tmpDir,
          clean: true,
        }),
        Effect.provide(layer),
      ),
    );

    const entries = await fs.readdir(tmpDir);
    assert.ok(!entries.includes("stale"));
  });
});
