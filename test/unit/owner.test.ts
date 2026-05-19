import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateOwnerSQL } from "../../src/generators/index.js";
import { join } from "./fixtures.js";

describe("generateOwnerSQL", () => {
  it("should produce ALTER TABLE … OWNER TO", () => {
    const result = join(generateOwnerSQL("s", "t", "myuser"));
    assert.equal(result, "ALTER TABLE s.t OWNER TO myuser;");
  });

  it("should quote identifiers with special characters", () => {
    const result = join(generateOwnerSQL("s", "t", "my-user"));
    assert.match(result, /OWNER TO "my-user"/);
  });
});
