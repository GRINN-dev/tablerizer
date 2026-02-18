import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateColumnGrantsSQL } from "../../lib/generators.js";
import { join } from "./fixtures.js";

describe("generateColumnGrantsSQL", () => {
  const colGrants = [
    { column_name: "z", grantor: "o", grantee: "r", privilege: "SELECT", is_grantable: false },
    { column_name: "a", grantor: "o", grantee: "r", privilege: "SELECT", is_grantable: false },
    { column_name: "m", grantor: "o", grantee: "r", privilege: "SELECT", is_grantable: false },
  ];

  it("should group columns by grantee+privilege and sort columns alphabetically", () => {
    const result = join(generateColumnGrantsSQL("s", "t", colGrants));
    assert.match(result, /GRANT SELECT \(a, m, z\) ON TABLE s\.t TO r;/);
  });

  it("should return empty array for no column grants", () => {
    assert.equal(generateColumnGrantsSQL("s", "t", []).length, 0);
  });
});
