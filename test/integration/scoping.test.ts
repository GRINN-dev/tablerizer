import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../src/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Scoping", () => {
  it('scope "all" should export tables + functions + materialized views', async () => {
    tablerizer.configure({ scope: "all" });
    const result = await tablerizer.export();
    assert.ok(result.tableFiles > 0);
    assert.ok(result.functionFiles > 0);
    assert.ok(result.materializedViewFiles > 0);
    await tablerizer.disconnect();
  });

  it('scope "tables" should only export tables', async () => {
    tablerizer.configure({ scope: "tables" });
    const result = await tablerizer.export();
    assert.ok(result.tableFiles > 0);
    assert.equal(result.functionFiles, 0);
    assert.equal(result.materializedViewFiles, 0);
    await tablerizer.disconnect();
  });
});
