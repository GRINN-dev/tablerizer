import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../src/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Row Level Security", () => {
  it("should export ENABLE ROW LEVEL SECURITY", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /ALTER TABLE app_public\.users ENABLE ROW LEVEL SECURITY;/);
    await tablerizer.disconnect();
  });

  it("should export FORCE ROW LEVEL SECURITY when set", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "posts");
    assert.match(sql, /FORCE ROW LEVEL SECURITY/);
    await tablerizer.disconnect();
  });

  it("should export policies with DROP IF EXISTS + CREATE POLICY", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");

    assert.match(sql, /DROP POLICY IF EXISTS users_select_own ON app_public\.users;/);
    assert.match(sql, /CREATE POLICY users_select_own ON app_public\.users/);
    assert.match(sql, /FOR SELECT/);
    assert.match(sql, /USING \(/);
    await tablerizer.disconnect();
  });

  it("should export RESTRICTIVE policies", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "posts");
    assert.match(sql, /AS RESTRICTIVE/);
    assert.match(sql, /posts_update_own/);
    await tablerizer.disconnect();
  });

  it("should export policies with WITH CHECK clause", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /WITH CHECK \(/);
    await tablerizer.disconnect();
  });

  it("should NOT have RLS section on tables without RLS", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "logs");
    assert.ok(
      !sql.includes("ROW LEVEL SECURITY"),
      "logs table should not have RLS section",
    );
    await tablerizer.disconnect();
  });
});
