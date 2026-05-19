import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateIndexesSQL } from "../../src/generators/index.js";
import type { IndexDefinition } from "../../src/database.js";
import { join } from "./fixtures.js";

describe("generateIndexesSQL", () => {
  const indexes: IndexDefinition[] = [
    { index_name: "idx_b", index_definition: "CREATE INDEX idx_b ON s.t USING btree (b)", comment: null },
    { index_name: "idx_a", index_definition: "CREATE INDEX idx_a ON s.t USING btree (a)", comment: null },
  ];

  it("should sort indexes alphabetically by name", () => {
    const result = join(generateIndexesSQL("s", indexes));
    const posA = result.indexOf("idx_a");
    const posB = result.indexOf("idx_b");
    assert.ok(posA < posB);
  });

  it("should produce DROP INDEX IF EXISTS before each CREATE INDEX", () => {
    const result = join(generateIndexesSQL("s", indexes));
    for (const idx of indexes) {
      const dropIdx = result.indexOf(`DROP INDEX IF EXISTS s.${idx.index_name}`);
      const createIdx = result.indexOf(idx.index_definition);
      assert.ok(dropIdx >= 0);
      assert.ok(createIdx >= 0);
      assert.ok(dropIdx < createIdx);
    }
  });

  it("should return empty array for no indexes", () => {
    assert.equal(generateIndexesSQL("s", []).length, 0);
  });
});
