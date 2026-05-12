import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig, parseConfigFile } from "../../src/config.js";

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
