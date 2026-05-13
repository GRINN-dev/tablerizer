import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import { freshTablerizer, cleanOutput, OUTPUT_DIR } from "../helpers.js";
import type { Tablerizer } from "../../src/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Single-object export", () => {
  it("exportTable returns SQL with role mappings applied, no files written", async () => {
    const sql = await tablerizer.exportTable("app_public", "users");

    assert.match(sql, /CREATE TABLE/);
    assert.match(sql, /:DATABASE_VISITOR/);
    assert.doesNotMatch(sql, new RegExp(String.raw`tablerizer_test_visitor_\w+`));

    const dirExists = await fs.access(OUTPUT_DIR).then(() => true, () => false);
    assert.equal(dirExists, false, "exportTable should not write any files");

    await tablerizer.disconnect();
  });

  it("exportFunction returns SQL with role mappings applied, no files written", async () => {
    const sql = await tablerizer.exportFunction("app_public", "get_user_post_count");

    assert.match(sql, /CREATE OR REPLACE FUNCTION/);
    assert.match(sql, /:DATABASE_VISITOR/);

    const dirExists = await fs.access(OUTPUT_DIR).then(() => true, () => false);
    assert.equal(dirExists, false, "exportFunction should not write any files");

    await tablerizer.disconnect();
  });

  it("exportFunction throws when function does not exist", async () => {
    await assert.rejects(
      () => tablerizer.exportFunction("app_public", "nonexistent_function"),
      { message: /nonexistent_function not found/ },
    );

    await tablerizer.disconnect();
  });
});
