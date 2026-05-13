import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { writeSnapshots } from "../../src/writer.js";

describe("writeSnapshots", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tablerizer-writer-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes files and creates nested directories", async () => {
    const targets = [
      { filePath: path.join(tmpDir, "app_public", "tables", "users.sql"), content: "-- users" },
      { filePath: path.join(tmpDir, "app_public", "functions", "auth.sql"), content: "-- auth" },
    ];

    await writeSnapshots(targets);

    const users = await fs.readFile(targets[0].filePath, "utf-8");
    const auth = await fs.readFile(targets[1].filePath, "utf-8");
    assert.equal(users, "-- users");
    assert.equal(auth, "-- auth");
  });

  it("handles empty target list", async () => {
    await writeSnapshots([]);
    const entries = await fs.readdir(tmpDir);
    assert.equal(entries.length, 0);
  });
});
