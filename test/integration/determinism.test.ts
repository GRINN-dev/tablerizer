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

describe("Deterministic Output", () => {
  it("should produce identical output on two consecutive runs", async () => {
    tablerizer.configure({ scope: "tables", include_date: false });

    const result1 = await tablerizer.export();
    const contents1 = new Map<string, string>();
    for (const f of result1.files) {
      contents1.set(f.filePath, await fs.readFile(f.filePath, "utf-8"));
    }
    await tablerizer.disconnect();

    // Second run
    tablerizer = freshTablerizer({ scope: "tables", include_date: false });
    const result2 = await tablerizer.export();
    for (const f of result2.files) {
      const content = await fs.readFile(f.filePath, "utf-8");
      assert.equal(
        content,
        contents1.get(f.filePath),
        `Non-deterministic output for ${f.name}`,
      );
    }
    await tablerizer.disconnect();
  });
});
