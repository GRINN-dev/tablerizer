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

describe("Function Export", () => {
  it("should export functions with CREATE OR REPLACE", async () => {
    tablerizer.configure({ scope: "functions" });
    const result = await tablerizer.export();
    assert.ok(result.functionFiles > 0);
    assert.equal(result.tableFiles, 0);

    const funcFile = result.files.find((f) => f.name === "get_user_post_count");
    assert.ok(funcFile);
    const sql = await fs.readFile(funcFile.filePath, "utf-8");
    assert.match(sql, /CREATE OR REPLACE FUNCTION/);
    assert.match(sql, /GRANT EXECUTE/);
    assert.match(sql, /:DATABASE_VISITOR/);
    await tablerizer.disconnect();
  });

  it("should export function comments", async () => {
    tablerizer.configure({ scope: "functions" });
    const result = await tablerizer.export();
    const funcFile = result.files.find(
      (f) => f.name === "get_user_post_count",
    );
    const sql = await fs.readFile(funcFile!.filePath, "utf-8");
    assert.match(sql, /COMMENT ON FUNCTION/);
    await tablerizer.disconnect();
  });
});
