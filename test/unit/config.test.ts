/**
 * Config tests — adaptés pour Effect-TS
 *
 * CONCEPT — Tester du code Effect
 *
 * Deux patterns principaux :
 *
 * 1. Pour du code qui RÉUSSIT :
 *      Effect.runSync(myEffect)  → retourne la valeur
 *
 * 2. Pour du code qui peut ÉCHOUER (on veut tester l'erreur) :
 *      Effect.runSync(Effect.either(myEffect))
 *        → retourne Either : Left(error) ou Right(value)
 *        → pas de throw, on peut inspecter l'erreur
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect, Either } from "effect";
import {
  resolveConfig,
  parseConfigFile,
  parseEnvVars,
  parseCliArgs,
  validateConfig,
  normalizeScope,
} from "../../src/config.js";

describe("resolveConfig", () => {
  it("returns valid defaults when given no layers", () => {
    const config = resolveConfig({});
    assert.deepStrictEqual(config.schemas, []);
    assert.strictEqual(config.out, "./tables");
    assert.strictEqual(config.roles, undefined);
    assert.strictEqual(config.database_url, undefined);
    assert.deepStrictEqual(config.role_mappings, {});
    assert.strictEqual(config.scope, "all");
    assert.strictEqual(config.include_date, false);
    assert.strictEqual(config.clean, true);
    assert.strictEqual(config.silent, false);
  });

  it("CLI overrides env, env overrides file", () => {
    const config = resolveConfig({
      file: { out: "./from-file", database_url: "file-db", schemas: ["file-schema"] },
      env: { out: "./from-env", database_url: "env-db" },
      cli: { out: "./from-cli" },
    });
    assert.strictEqual(config.out, "./from-cli");
    assert.strictEqual(config.database_url, "env-db");
    assert.deepStrictEqual(config.schemas, ["file-schema"]);
  });

  it("merges role_mappings additively across layers", () => {
    const config = resolveConfig({
      file: { role_mappings: { file_role: ":FILE" } },
      env: { role_mappings: { env_role: ":ENV" } },
      cli: { role_mappings: { cli_role: ":CLI" } },
    });
    assert.deepStrictEqual(config.role_mappings, {
      file_role: ":FILE",
      env_role: ":ENV",
      cli_role: ":CLI",
    });
  });

  it("higher layer wins for conflicting role_mappings keys", () => {
    const config = resolveConfig({
      file: { role_mappings: { admin: ":FILE_ADMIN" } },
      cli: { role_mappings: { admin: ":CLI_ADMIN" } },
    });
    assert.strictEqual(config.role_mappings!.admin, ":CLI_ADMIN");
  });
});

describe("parseConfigFile", () => {
  // parseConfigFile retourne maintenant un Effect.
  // On utilise Effect.runSync pour obtenir la valeur.
  it("expands env vars in string values", () => {
    const json = JSON.stringify({
      database_url: "$DATABASE_URL",
      out: "${OUTPUT_DIR}",
      schemas: ["${SCHEMA_NAME}"],
    });
    const env = { DATABASE_URL: "postgres://prod/db", OUTPUT_DIR: "/out", SCHEMA_NAME: "public" };
    const config = Effect.runSync(parseConfigFile(json, env));
    assert.strictEqual(config.database_url, "postgres://prod/db");
    assert.strictEqual(config.out, "/out");
    assert.deepStrictEqual(config.schemas, ["public"]);
  });

  it("supports default value syntax ${VAR:default}", () => {
    const json = JSON.stringify({ out: "${MISSING_VAR:./fallback}" });
    const config = Effect.runSync(parseConfigFile(json, {}));
    assert.strictEqual(config.out, "./fallback");
  });

  it("expands env vars in role_mappings keys", () => {
    const json = JSON.stringify({
      role_mappings: { "$OWNER_ROLE": ":DATABASE_OWNER" },
    });
    const env = { OWNER_ROLE: "myapp_admin" };
    const config = Effect.runSync(parseConfigFile(json, env));
    assert.deepStrictEqual(config.role_mappings, { myapp_admin: ":DATABASE_OWNER" });
  });

  it("leaves unmatched vars intact", () => {
    const json = JSON.stringify({ out: "$UNSET_VAR" });
    const config = Effect.runSync(parseConfigFile(json, {}));
    assert.strictEqual(config.out, "$UNSET_VAR");
  });

  it("parses JSON and returns typed config", () => {
    const json = JSON.stringify({
      schemas: ["app_public"],
      out: "./exports",
      database_url: "postgres://localhost/mydb",
      roles: ["admin"],
      role_mappings: { admin: ":ADMIN" },
      scope: "tables",
      include_date: true,
      clean: false,
      silent: true,
    });
    const config = Effect.runSync(parseConfigFile(json));
    assert.deepStrictEqual(config.schemas, ["app_public"]);
    assert.strictEqual(config.out, "./exports");
    assert.strictEqual(config.database_url, "postgres://localhost/mydb");
    assert.deepStrictEqual(config.roles, ["admin"]);
    assert.deepStrictEqual(config.role_mappings, { admin: ":ADMIN" });
    assert.strictEqual(config.scope, "tables");
    assert.strictEqual(config.include_date, true);
    assert.strictEqual(config.clean, false);
    assert.strictEqual(config.silent, true);
  });
});

describe("parseEnvVars", () => {
  it("reads known env vars into config", () => {
    const config = parseEnvVars({
      DATABASE_URL: "postgres://localhost/db",
      SCHEMAS: "app_public, app_private",
      OUTPUT_DIR: "./out",
      ROLES: "admin, visitor",
    });
    assert.strictEqual(config.database_url, "postgres://localhost/db");
    assert.deepStrictEqual(config.schemas, ["app_public", "app_private"]);
    assert.strictEqual(config.out, "./out");
    assert.deepStrictEqual(config.roles, ["admin", "visitor"]);
  });

  it("ignores missing env vars", () => {
    const config = parseEnvVars({});
    assert.strictEqual(config.database_url, undefined);
    assert.strictEqual(config.schemas, undefined);
    assert.strictEqual(config.out, undefined);
    assert.strictEqual(config.roles, undefined);
  });
});

describe("parseCliArgs", () => {
  it("parses all supported flags", () => {
    const config = parseCliArgs([
      "--schemas", "app_public,app_private",
      "--out", "./exports",
      "--roles", "admin,visitor",
      "--database-url", "postgres://localhost/db",
      "--scope", "tables",
      "--include-date",
      "--no-clean",
      "--silent",
    ]);
    assert.deepStrictEqual(config.schemas, ["app_public", "app_private"]);
    assert.strictEqual(config.out, "./exports");
    assert.deepStrictEqual(config.roles, ["admin", "visitor"]);
    assert.strictEqual(config.database_url, "postgres://localhost/db");
    assert.strictEqual(config.scope, "tables");
    assert.strictEqual(config.include_date, true);
    assert.strictEqual(config.clean, false);
    assert.strictEqual(config.silent, true);
  });

  it("parses boolean flag negations", () => {
    const config = parseCliArgs(["--no-date", "--clean"]);
    assert.strictEqual(config.include_date, false);
    assert.strictEqual(config.clean, true);
  });

  it("returns empty partial for no args", () => {
    const config = parseCliArgs([]);
    assert.strictEqual(config.schemas, undefined);
    assert.strictEqual(config.out, undefined);
    assert.strictEqual(config.database_url, undefined);
  });
});

describe("normalizeScope", () => {
  it("expands 'all' to every concrete scope", () => {
    const result = normalizeScope("all");
    assert.deepStrictEqual(result, ["tables", "functions", "views", "materialized-views"]);
  });

  it("expands undefined to every concrete scope", () => {
    const result = normalizeScope(undefined);
    assert.deepStrictEqual(result, ["tables", "functions", "views", "materialized-views"]);
  });

  it("wraps a single scope string into an array", () => {
    const result = normalizeScope("tables");
    assert.deepStrictEqual(result, ["tables"]);
  });

  it("passes through an array unchanged", () => {
    const result = normalizeScope(["tables", "functions"]);
    assert.deepStrictEqual(result, ["tables", "functions"]);
  });
});

describe("validateConfig", () => {
  // validateConfig retourne un Effect maintenant.
  // Pour tester les erreurs, on utilise Effect.either :
  //   → Left(error)  si validation échoue
  //   → Right(config) si validation réussit
  it("fails when schemas is empty", () => {
    const result = Effect.runSync(
      Effect.either(validateConfig({ schemas: [], database_url: "postgres://localhost/db" })),
    );
    assert.ok(Either.isLeft(result));
    if (Either.isLeft(result)) {
      assert.ok(result.left.issues.includes("At least one schema must be specified"));
    }
  });

  it("fails when database_url is missing", () => {
    const result = Effect.runSync(
      Effect.either(validateConfig({ schemas: ["public"] })),
    );
    assert.ok(Either.isLeft(result));
    if (Either.isLeft(result)) {
      assert.ok(result.left.issues.includes("Database URL must be provided"));
    }
  });

  it("fails when a schema name is empty string", () => {
    const result = Effect.runSync(
      Effect.either(validateConfig({ schemas: ["public", ""], database_url: "postgres://localhost/db" })),
    );
    assert.ok(Either.isLeft(result));
    if (Either.isLeft(result)) {
      assert.ok(result.left.issues.includes("Schema names cannot be empty"));
    }
  });

  it("passes for valid config", () => {
    const result = Effect.runSync(
      Effect.either(validateConfig({ schemas: ["public"], database_url: "postgres://localhost/db" })),
    );
    assert.ok(Either.isRight(result));
  });
});
