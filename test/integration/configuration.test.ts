import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput, db } from "../helpers.js";
import type { Tablerizer } from "../../lib/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Configuration", () => {
  it("should include date header when include_date is true", async () => {
    tablerizer.configure({ scope: "tables", include_date: true });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /-- Date: \d{4}-/);
    await tablerizer.disconnect();
  });

  it("should exclude date header when include_date is false", async () => {
    tablerizer.configure({ scope: "tables", include_date: false });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.ok(!sql.includes("-- Date:"));
    await tablerizer.disconnect();
  });

  it("should apply custom role mappings", async () => {
    tablerizer = freshTablerizer({
      scope: "tables",
      role_mappings: { [db.visitorRole]: ":CUSTOM_ROLE" },
    });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.ok(sql.includes(":CUSTOM_ROLE"));
    assert.ok(!sql.includes("tablerizer_visitor"));
    await tablerizer.disconnect();
  });
});
