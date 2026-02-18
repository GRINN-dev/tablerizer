import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyRoleMappings } from "../../lib/generators.js";

describe("applyRoleMappings", () => {
  it("should replace role names in GRANT TO", () => {
    const sql = "GRANT SELECT ON TABLE s.t TO my_role;";
    const result = applyRoleMappings(sql, { my_role: ":MAPPED" });
    assert.match(result, /TO :MAPPED/);
  });

  it("should replace role names in REVOKE FROM", () => {
    const sql = "REVOKE ALL ON TABLE s.t FROM my_role;";
    const result = applyRoleMappings(sql, { my_role: ":MAPPED" });
    assert.match(result, /FROM :MAPPED/);
  });
});
