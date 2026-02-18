import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateDropTableSQL } from "../../lib/generators.js";
import { join } from "./fixtures.js";

describe("generateDropTableSQL", () => {
  it("should produce DROP TABLE IF EXISTS … CASCADE", () => {
    const result = join(generateDropTableSQL("app", "users"));
    assert.equal(result, "DROP TABLE IF EXISTS app.users CASCADE;");
  });
});
