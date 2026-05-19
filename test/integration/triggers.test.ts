import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../src/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Triggers", () => {
  it("should export triggers with DROP IF EXISTS + CREATE TRIGGER", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /DROP TRIGGER IF EXISTS users_updated_at ON app_public\.users;/);
    assert.match(sql, /CREATE TRIGGER users_updated_at/);
    assert.match(sql, /BEFORE UPDATE/);
    assert.match(sql, /EXECUTE FUNCTION .*update_updated_at\(\)/);
    await tablerizer.disconnect();
  });

  it("should handle multi-event triggers (INSERT OR UPDATE)", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "posts");
    assert.match(sql, /CREATE TRIGGER posts_updated_at/);
    assert.match(sql, /INSERT OR UPDATE/);
    await tablerizer.disconnect();
  });

  it("should NOT have TRIGGERS section on tables without triggers", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "logs");
    assert.ok(!sql.includes("-- TRIGGERS"), "logs table should not have TRIGGERS section");
    await tablerizer.disconnect();
  });
});
