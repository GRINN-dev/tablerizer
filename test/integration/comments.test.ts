import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../lib/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Comments", () => {
  it("should export table comments", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /COMMENT ON TABLE app_public\.users IS 'Main user accounts table';/);
    await tablerizer.disconnect();
  });

  it("should export column comments", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(
      sql,
      /COMMENT ON COLUMN app_public\.users\.email IS 'User email address, must be unique';/,
    );
    assert.match(sql, /COMMENT ON COLUMN app_public\.users\.metadata IS/);
    await tablerizer.disconnect();
  });

  it("should export index comments", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "users");
    assert.match(sql, /COMMENT ON INDEX app_public\.idx_users_email_lower IS/);
    await tablerizer.disconnect();
  });

  it("should still have COMMENTS section when table has a comment", async () => {
    tablerizer.configure({ scope: "tables" });
    await tablerizer.export();
    const sql = await readOutput("app_public", "tables", "logs");
    assert.match(sql, /COMMENT ON TABLE app_public\.logs IS/);
    await tablerizer.disconnect();
  });
});
