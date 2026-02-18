import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../lib/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Partitioned Tables", () => {
  it("should include PARTITION BY clause in CREATE TABLE", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "sales");
    assert.match(sql, /PARTITION BY RANGE \(sale_date\)/);
    await tablerizer.disconnect();
  });

  it("should export parent table but NOT individual partitions", async () => {
    tablerizer.configure({ scope: "tables" });
    const result = await tablerizer.export();
    const salesFiles = result.files.filter(
      (f) => f.schema === "app_public" && f.name.startsWith("sales"),
    );
    assert.equal(salesFiles.length, 1, "Only parent table should be exported");
    assert.equal(salesFiles[0].name, "sales");
    await tablerizer.disconnect();
  });
});
