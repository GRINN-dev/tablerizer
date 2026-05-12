import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../src/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Grants", () => {
  it("should export table-level grants with REVOKE ALL first", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /REVOKE ALL ON TABLE app_public\.users FROM/);
    assert.match(sql, /GRANT SELECT ON TABLE app_public\.users TO :DATABASE_VISITOR;/);
    await tablerizer.disconnect();
  });

  it("should export column-level grants with columns sorted alphabetically", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    // PostgreSQL reports all columns when both table-level and column-level SELECTs exist.
    // The key invariant: columns inside the parentheses must be sorted alphabetically.
    const m = sql.match(/GRANT SELECT \(([^)]+)\) ON TABLE app_public\.users/);
    assert.ok(m, "Should have a column-level SELECT grant");
    const cols = m![1].split(",").map((c) => c.trim());
    const sorted = [...cols].sort();
    assert.deepEqual(cols, sorted, "Columns should be sorted alphabetically");
    await tablerizer.disconnect();
  });

  it("should export UPDATE column grants separately from SELECT", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /GRANT UPDATE \(metadata, name\) ON TABLE app_public\.users TO :DATABASE_VISITOR;/);
    await tablerizer.disconnect();
  });

  it("should apply role mappings to grants", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.ok(!sql.includes("tablerizer_visitor"), "Raw role name should not appear");
    assert.ok(sql.includes(":DATABASE_VISITOR"), "Mapped role should appear");
    await tablerizer.disconnect();
  });

  it("should NOT have GRANTS section on tables with no grants", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "logs");
    assert.ok(!sql.includes("-- GRANTS"), "logs table should not have GRANTS section");
    await tablerizer.disconnect();
  });
});
