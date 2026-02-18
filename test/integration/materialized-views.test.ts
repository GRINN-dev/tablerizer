import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../lib/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Materialized View Export", () => {
  it("should export materialized views with documentation", async () => {
    tablerizer.configure({ scope: "materialized-views" });
    const result = await tablerizer.export();
    assert.ok(result.materializedViewFiles > 0);

    const mvFile = result.files.find((f) => f.name === "user_stats");
    assert.ok(mvFile);
    const sql = await fs.readFile(mvFile.filePath, "utf-8");
    assert.match(sql, /MATERIALIZED VIEW DOCUMENTATION/);
    assert.match(sql, /Owner:/);
    assert.match(sql, /INDEXES:/);
    assert.match(sql, /idx_user_stats_id/);
    await tablerizer.disconnect();
  });
});
