import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../lib/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Indexes", () => {
  it("should export non-constraint indexes with DROP IF EXISTS", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "posts");
    assert.match(sql, /DROP INDEX IF EXISTS app_public\.idx_posts_author;/);
    assert.match(sql, /CREATE INDEX idx_posts_author ON app_public\.posts/);
    await tablerizer.disconnect();
  });

  it("should export partial indexes (WHERE clause)", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "posts");
    assert.match(sql, /idx_posts_status/);
    assert.match(sql, /WHERE/i);
    await tablerizer.disconnect();
  });

  it("should export expression indexes", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /idx_users_email_lower/);
    assert.match(sql, /lower\(email\)/i);
    await tablerizer.disconnect();
  });

  it("should export GIN indexes", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /idx_users_metadata/);
    assert.match(sql, /USING gin/i);
    await tablerizer.disconnect();
  });

  it("should NOT export indexes that back constraints (PK, UNIQUE)", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");

    // The INDEXES section should not contain users_pkey or users_email_key
    const indexSection = sql.split("-- INDEXES")[1]?.split("-- COMMENTS")[0] || "";
    assert.ok(
      !indexSection.includes("users_pkey"),
      "PK index should not appear in INDEXES section",
    );
    await tablerizer.disconnect();
  });
});
