import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateGrantsSQL } from "../../src/generators/index.js";
import { join } from "./fixtures.js";

describe("generateGrantsSQL", () => {
  const grants = [
    { grantor: "o", grantee: "b_role", privilege: "INSERT", is_grantable: false },
    { grantor: "o", grantee: "a_role", privilege: "SELECT", is_grantable: true },
    { grantor: "o", grantee: "a_role", privilege: "DELETE", is_grantable: false },
  ];

  it("should emit REVOKE ALL for each unique grantee, sorted", () => {
    const result = join(generateGrantsSQL("s", "t", grants));
    const revokeA = result.indexOf("REVOKE ALL ON TABLE s.t FROM a_role");
    const revokeB = result.indexOf("REVOKE ALL ON TABLE s.t FROM b_role");
    assert.ok(revokeA >= 0);
    assert.ok(revokeB >= 0);
    assert.ok(revokeA < revokeB);
  });

  it("should sort grants by grantee then privilege", () => {
    const result = join(generateGrantsSQL("s", "t", grants));
    const deletePos = result.indexOf("GRANT DELETE");
    const selectPos = result.indexOf("GRANT SELECT");
    const insertPos = result.indexOf("GRANT INSERT");
    // a_role: DELETE < SELECT, then b_role: INSERT
    assert.ok(deletePos < selectPos);
    assert.ok(selectPos < insertPos);
  });

  it("should include WITH GRANT OPTION when is_grantable", () => {
    const result = join(generateGrantsSQL("s", "t", grants));
    assert.match(result, /GRANT SELECT ON TABLE s\.t TO a_role WITH GRANT OPTION;/);
  });

  it("should return empty array for no grants", () => {
    assert.equal(generateGrantsSQL("s", "t", []).length, 0);
  });
});
