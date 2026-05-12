import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateRlsSQL } from "../../src/generators/index.js";
import { join } from "./fixtures.js";

describe("generateRlsSQL", () => {
  it("should emit ENABLE and FORCE when both are set", () => {
    const result = join(generateRlsSQL("s", "t", true, true, []));
    assert.match(result, /ENABLE ROW LEVEL SECURITY/);
    assert.match(result, /FORCE ROW LEVEL SECURITY/);
  });

  it("should emit DROP POLICY IF EXISTS before each CREATE POLICY", () => {
    const policies = [
      { policy: "pol_b", cmd: "SELECT", roles: ["r"], permissive: "PERMISSIVE", using: "true" },
      { policy: "pol_a", cmd: "INSERT", roles: ["r"], permissive: "PERMISSIVE", with_check: "true" },
    ];
    const result = join(generateRlsSQL("s", "t", true, false, policies));
    // Sorted alphabetically: pol_a before pol_b
    const posA = result.indexOf("pol_a");
    const posB = result.indexOf("pol_b");
    assert.ok(posA < posB);

    assert.match(result, /DROP POLICY IF EXISTS pol_a ON s\.t;/);
    assert.match(result, /CREATE POLICY pol_a ON s\.t/);
  });

  it("should include AS RESTRICTIVE when permissive is RESTRICTIVE", () => {
    const policies = [
      { policy: "p", cmd: "UPDATE", roles: null, permissive: "RESTRICTIVE", using: "true" },
    ];
    const result = join(generateRlsSQL("s", "t", true, false, policies));
    assert.match(result, /AS RESTRICTIVE/);
  });

  it("should sort roles alphabetically within a policy", () => {
    const policies = [
      { policy: "p", cmd: "SELECT", roles: ["z_role", "a_role"], permissive: "PERMISSIVE", using: "true" },
    ];
    const result = join(generateRlsSQL("s", "t", true, false, policies));
    assert.match(result, /TO a_role, z_role/);
  });
});
