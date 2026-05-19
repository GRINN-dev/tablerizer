import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../src/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Table Export — DDL structure", () => {
  it("should generate DROP TABLE IF EXISTS CASCADE", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /DROP TABLE IF EXISTS app_public\.users CASCADE;/);
    await tablerizer.disconnect();
  });

  it("should generate CREATE TABLE with exact column types from pg_catalog", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");

    // Check CREATE TABLE
    assert.match(sql, /CREATE TABLE app_public\.users \(/);

    // integer (not int4)
    assert.match(sql, /id integer NOT NULL/);
    // text NOT NULL
    assert.match(sql, /email text NOT NULL/);
    assert.match(sql, /name text NOT NULL/);
    // timestamptz with default
    assert.match(sql, /created_at timestamp with time zone NOT NULL DEFAULT now\(\)/);
    // boolean with default
    assert.match(sql, /is_active boolean NOT NULL DEFAULT true/);
    // text[] array type
    assert.match(sql, /tags text\[\]/);
    // jsonb nullable
    assert.match(sql, /metadata jsonb/);
    // numeric with precision
    assert.match(sql, /balance numeric\(12,2\)/);

    await tablerizer.disconnect();
  });

  it("should generate OWNER", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /ALTER TABLE app_public\.users OWNER TO /);
    await tablerizer.disconnect();
  });

  it("should contain all section headers", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");

    const expectedSections = [
      "DROP (idempotent cleanup)",
      "CREATE TABLE",
      "OWNER",
      "CONSTRAINTS",
      "COMMENTS",
      "ROW LEVEL SECURITY",
      "GRANTS",
      "TRIGGERS",
    ];
    for (const section of expectedSections) {
      assert.ok(
        sql.includes(`-- ${section}`),
        `Missing section header: "${section}"`,
      );
    }
    await tablerizer.disconnect();
  });
});
