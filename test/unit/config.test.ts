import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig } from "../../src/config.js";

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
