import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateConstraintsSQL } from "../../lib/generators.js";
import type { ConstraintDefinition } from "../../lib/database.js";
import { join } from "./fixtures.js";

describe("generateConstraintsSQL", () => {
  const constraints: ConstraintDefinition[] = [
    { constraint_name: "t_pkey", constraint_type: "p", definition: "PRIMARY KEY (id)" },
    { constraint_name: "t_name_key", constraint_type: "u", definition: "UNIQUE (name)" },
    { constraint_name: "t_fk", constraint_type: "f", definition: "FOREIGN KEY (ref_id) REFERENCES other(id)" },
    { constraint_name: "t_check", constraint_type: "c", definition: "CHECK ((age > 0))" },
  ];

  it("should sort by type (PK, UNIQUE, FK, CHECK) then by name", () => {
    const result = join(generateConstraintsSQL("s", "t", constraints));
    const pkPos = result.indexOf("t_pkey");
    const ukPos = result.indexOf("t_name_key");
    const fkPos = result.indexOf("t_fk");
    const ckPos = result.indexOf("t_check");
    assert.ok(pkPos < ukPos && ukPos < fkPos && fkPos < ckPos);
  });

  it("should produce DROP CONSTRAINT IF EXISTS before each ADD CONSTRAINT", () => {
    const result = join(generateConstraintsSQL("s", "t", constraints));
    for (const c of constraints) {
      const dropIdx = result.indexOf(`DROP CONSTRAINT IF EXISTS ${c.constraint_name}`);
      const addIdx = result.indexOf(`ADD CONSTRAINT ${c.constraint_name}`);
      assert.ok(dropIdx >= 0, `Missing DROP for ${c.constraint_name}`);
      assert.ok(addIdx >= 0, `Missing ADD for ${c.constraint_name}`);
      assert.ok(dropIdx < addIdx, `DROP should come before ADD for ${c.constraint_name}`);
    }
  });

  it("should include a comment line with constraint type name", () => {
    const result = join(generateConstraintsSQL("s", "t", constraints));
    assert.match(result, /-- PRIMARY KEY: t_pkey/);
    assert.match(result, /-- UNIQUE: t_name_key/);
    assert.match(result, /-- FOREIGN KEY: t_fk/);
    assert.match(result, /-- CHECK: t_check/);
  });

  it("should return empty array for no constraints", () => {
    assert.equal(generateConstraintsSQL("s", "t", []).length, 0);
  });

  it("should filter out system-generated constraints with numeric prefixes", () => {
    const withSystem: ConstraintDefinition[] = [
      { constraint_name: "123_456_789_not_null", constraint_type: "c", definition: "CHECK ((x IS NOT NULL))" },
      { constraint_name: "real_check", constraint_type: "c", definition: "CHECK ((x > 0))" },
    ];
    const result = join(generateConstraintsSQL("s", "t", withSystem));
    assert.ok(!result.includes("123_456_789_not_null"));
    assert.ok(result.includes("real_check"));
  });
});
