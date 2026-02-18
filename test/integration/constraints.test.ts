import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../lib/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Constraints", () => {
  it("should export PRIMARY KEY via ALTER TABLE ADD CONSTRAINT", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /ALTER TABLE app_public\.users ADD CONSTRAINT users_pkey PRIMARY KEY/);
    await tablerizer.disconnect();
  });

  it("should export UNIQUE constraints", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /ADD CONSTRAINT users_email_key UNIQUE/);
    await tablerizer.disconnect();
  });

  it("should export CHECK constraints", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /ADD CONSTRAINT email_format CHECK/);
    assert.match(sql, /ADD CONSTRAINT name_not_empty CHECK/);
    assert.match(sql, /ADD CONSTRAINT age_positive CHECK/);
    await tablerizer.disconnect();
  });

  it("should export FOREIGN KEY constraints", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "posts");
    assert.match(sql, /FOREIGN KEY/);
    assert.match(sql, /REFERENCES app_public\.users\(id\)/);
    await tablerizer.disconnect();
  });

  it("should export composite PRIMARY KEY", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "post_tags");
    assert.match(sql, /ADD CONSTRAINT post_tags_pkey PRIMARY KEY/);
    await tablerizer.disconnect();
  });

  it("should precede each ADD CONSTRAINT with DROP CONSTRAINT IF EXISTS", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");

    // For each ADD CONSTRAINT, verify a DROP CONSTRAINT IF EXISTS precedes it
    const addMatches = sql.matchAll(
      /ALTER TABLE .+ ADD CONSTRAINT (\S+)/g,
    );
    for (const m of addMatches) {
      const constraintName = m[1];
      assert.ok(
        sql.includes(`DROP CONSTRAINT IF EXISTS ${constraintName}`),
        `Missing DROP CONSTRAINT IF EXISTS for ${constraintName}`,
      );
    }
    await tablerizer.disconnect();
  });

  it("should export cross-schema foreign key", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_private", "tables", "user_secrets");
    assert.match(sql, /REFERENCES app_public\.users\(id\)/);
    await tablerizer.disconnect();
  });
});
