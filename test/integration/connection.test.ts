import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readOutput, freshTablerizer, cleanOutput } from "../helpers.js";
import type { Tablerizer } from "../../lib/index.js";

let tablerizer: Tablerizer;

beforeEach(async () => {
  await cleanOutput();
  tablerizer = freshTablerizer();
});

describe("Database Connection", () => {
  it("should connect and disconnect cleanly", async () => {
    await tablerizer.connect();
    await tablerizer.disconnect();
  });
});
