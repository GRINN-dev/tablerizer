import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig, parseConfigFile, parseEnvVars, parseCliArgs } from "../../src/config.js";

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
});

describe("parseConfigFile", () => {
  it("expands env vars in string values", () => {
    const json = JSON.stringify({
      database_url: "$DATABASE_URL",
      out: "${OUTPUT_DIR}",
      schemas: ["${SCHEMA_NAME}"],
    });
    const env = { DATABASE_URL: "postgres://prod/db", OUTPUT_DIR: "/out", SCHEMA_NAME: "public" };
    const config = parseConfigFile(json, env);
    assert.strictEqual(config.database_url, "postgres://prod/db");
    assert.strictEqual(config.out, "/out");
    assert.deepStrictEqual(config.schemas, ["public"]);
  });

  it("supports default value syntax ${VAR:default}", () => {
    const json = JSON.stringify({ out: "${MISSING_VAR:./fallback}" });
    const config = parseConfigFile(json, {});
    assert.strictEqual(config.out, "./fallback");
  });

  it("expands env vars in role_mappings keys", () => {
    const json = JSON.stringify({
      role_mappings: { "$OWNER_ROLE": ":DATABASE_OWNER" },
    });
    const env = { OWNER_ROLE: "myapp_admin" };
    const config = parseConfigFile(json, env);
    assert.deepStrictEqual(config.role_mappings, { myapp_admin: ":DATABASE_OWNER" });
  });

  it("leaves unmatched vars intact", () => {
    const json = JSON.stringify({ out: "$UNSET_VAR" });
    const config = parseConfigFile(json, {});
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
    const config = parseConfigFile(json);
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
