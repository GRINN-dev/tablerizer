import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateIndexCommentsSQL } from "../../src/generators.js";
import type { IndexDefinition } from "../../src/database.js";
import { join } from "./fixtures.js";

describe("generateIndexCommentsSQL", () => {
  it("should produce COMMENT ON INDEX for indexes with comments", () => {
    const idxs: IndexDefinition[] = [
      { index_name: "idx_a", index_definition: "", comment: "fast" },
      { index_name: "idx_b", index_definition: "", comment: null },
    ];
    const result = join(generateIndexCommentsSQL("s", idxs));
    assert.match(result, /COMMENT ON INDEX s\.idx_a IS 'fast';/);
    assert.ok(!result.includes("idx_b"));
  });
});
