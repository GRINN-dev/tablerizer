import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateCommentsSQL } from "../../lib/generators.js";
import type { ColumnDefinition } from "../../lib/database.js";
import { join, cols } from "./fixtures.js";

describe("generateCommentsSQL", () => {
  it("should produce COMMENT ON TABLE first, then columns by ordinal_position", () => {
    const result = join(generateCommentsSQL("s", "t", "Table desc", cols));
    const tablePos = result.indexOf("COMMENT ON TABLE");
    const colPos = result.indexOf("COMMENT ON COLUMN");
    assert.ok(tablePos >= 0);
    assert.ok(colPos >= 0);
    assert.ok(tablePos < colPos);
  });

  it("should only emit comments for columns that have one", () => {
    const result = join(generateCommentsSQL("s", "t", undefined, cols));
    // Only 'name' has a comment
    assert.match(result, /COMMENT ON COLUMN s\.t\.name IS 'The name';/);
    assert.ok(!result.includes("COMMENT ON COLUMN s.t.id"));
    assert.ok(!result.includes("COMMENT ON COLUMN s.t.active"));
  });

  it("should return empty when no table comment and no column comments", () => {
    const noCols: ColumnDefinition[] = [
      { column_name: "x", data_type: "int", not_null: false, column_default: null, comment: null, ordinal_position: 1 },
    ];
    const result = generateCommentsSQL("s", "t", undefined, noCols);
    assert.equal(result.length, 0);
  });

  it("should use dollar-quoting for comments containing single quotes", () => {
    const result = join(generateCommentsSQL("s", "t", "It's a table", []));
    assert.match(result, /\$\$It's a table\$\$/);
  });
});
