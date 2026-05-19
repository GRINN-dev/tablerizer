import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../src/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Edge Cases", () => {
  it("should handle tables with no constraints, indexes, RLS, grants, or triggers", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "logs");

    // Must still have the core sections
    assert.match(sql, /DROP TABLE IF EXISTS/);
    assert.match(sql, /CREATE TABLE app_public\.logs/);
    assert.match(sql, /OWNER/);

    // Optional sections should be absent
    assert.ok(!sql.includes("-- CONSTRAINTS"), "No constraints expected");
    assert.ok(!sql.includes("-- INDEXES"), "No indexes expected");
    assert.ok(!sql.includes("-- ROW LEVEL SECURITY"), "No RLS expected");
    assert.ok(!sql.includes("-- GRANTS"), "No grants expected");
    assert.ok(!sql.includes("-- TRIGGERS"), "No triggers expected");

    await tablerizer.disconnect();
  });

  it("should handle tables with composite primary keys", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "post_tags");
    assert.match(sql, /PRIMARY KEY \(post_id, tag\)/);
    await tablerizer.disconnect();
  });
});
