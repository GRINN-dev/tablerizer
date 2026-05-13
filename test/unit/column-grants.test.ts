import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateColumnGrantsSQL } from "../../src/generators/index.js";
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

  it("should handle grantee names containing colons", () => {
    const grants = [
      { column_name: "a", grantor: "o", grantee: "role:special", privilege: "SELECT", is_grantable: false },
      { column_name: "b", grantor: "o", grantee: "role:special", privilege: "SELECT", is_grantable: false },
    ];
    const result = join(generateColumnGrantsSQL("s", "t", grants));
    assert.match(result, /GRANT SELECT \(a, b\) ON TABLE s\.t TO "role:special";/);
    assert.equal(result.match(/GRANT SELECT/g)?.length, 1, "should produce exactly one GRANT SELECT");
  });
});
