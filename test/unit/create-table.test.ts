import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateCreateTableSQL } from "../../src/generators.js";
import { join, cols } from "./fixtures.js";

describe("generateCreateTableSQL", () => {
  it("should list columns in ordinal_position order", () => {
    const result = join(generateCreateTableSQL("s", "t", cols, null));
    assert.match(result, /CREATE TABLE s\.t \(/);
    // id comes before name comes before active
    const idPos = result.indexOf("id integer");
    const namePos = result.indexOf("name text");
    const activePos = result.indexOf("active boolean");
    assert.ok(idPos < namePos && namePos < activePos);
  });

  it("should include NOT NULL and DEFAULT inline", () => {
    const result = join(generateCreateTableSQL("s", "t", cols, null));
    assert.match(result, /id integer NOT NULL DEFAULT nextval\('s'::regclass\)/);
    assert.match(result, /name text NOT NULL/);
    assert.match(result, /active boolean DEFAULT true/);
  });

  it("should end with );", () => {
    const result = join(generateCreateTableSQL("s", "t", cols, null));
    assert.ok(result.trimEnd().endsWith(");"));
  });

  it("should add PARTITION BY when partitionInfo is set", () => {
    // pg_get_partkeydef returns the full clause like "RANGE (id)"
    const result = join(
      generateCreateTableSQL("s", "t", cols, {
        partition_strategy: "r",
        partition_key: "RANGE (id)",
      }),
    );
    assert.match(result, /\) PARTITION BY RANGE \(id\);/);
  });

  it("should handle LIST and HASH partition strategies", () => {
    const list = join(generateCreateTableSQL("s", "t", cols, { partition_strategy: "l", partition_key: "LIST (name)" }));
    assert.match(list, /PARTITION BY LIST \(name\)/);
    const hash = join(generateCreateTableSQL("s", "t", cols, { partition_strategy: "h", partition_key: "HASH (id)" }));
    assert.match(hash, /PARTITION BY HASH \(id\)/);
  });

  it("should handle an empty column list", () => {
    const result = join(generateCreateTableSQL("s", "t", [], null));
    assert.equal(result, "CREATE TABLE s.t ();");
  });

  it("should separate columns with commas except the last one", () => {
    const result = join(generateCreateTableSQL("s", "t", cols, null));
    const lines = result.split("\n").filter((l) => l.startsWith("    "));
    // First two should end with ','
    assert.ok(lines[0].endsWith(","));
    assert.ok(lines[1].endsWith(","));
    // Last should NOT
    assert.ok(!lines[2].endsWith(","));
  });
});
