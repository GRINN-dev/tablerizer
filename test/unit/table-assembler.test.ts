import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateTableSQL, type TableData } from "../../src/generators.js";

describe("generateTableSQL", () => {
  const minimalTable: TableData = {
    table: "empty",
    owner: "owner",
    rls: { enabled: false, force: false, policies: [] },
    rbac: { table_grants: [], column_grants: [] },
    triggers: [],
    column_definitions: [
      { column_name: "id", data_type: "integer", not_null: true, column_default: null, comment: null, ordinal_position: 1 },
    ],
    constraint_definitions: [],
    index_definitions: [],
    partition_info: null,
  };

  it("should always contain header, DROP, CREATE TABLE, and OWNER sections", () => {
    const result = generateTableSQL("s", minimalTable);
    assert.match(result, /-- Table: s\.empty/);
    assert.match(result, /DROP TABLE IF EXISTS s\.empty CASCADE;/);
    assert.match(result, /CREATE TABLE s\.empty \(/);
    assert.match(result, /ALTER TABLE s\.empty OWNER TO owner;/);
  });

  it("should omit optional sections when data is empty", () => {
    const result = generateTableSQL("s", minimalTable);
    assert.ok(!result.includes("-- CONSTRAINTS"));
    assert.ok(!result.includes("-- INDEXES"));
    assert.ok(!result.includes("-- COMMENTS"));
    assert.ok(!result.includes("-- ROW LEVEL SECURITY"));
    assert.ok(!result.includes("-- GRANTS"));
    assert.ok(!result.includes("-- TRIGGERS"));
  });

  it("should include all sections when data is present", () => {
    const full: TableData = {
      table: "full",
      owner: "owner",
      rls: {
        enabled: true,
        force: false,
        policies: [{ policy: "p", cmd: "SELECT", roles: ["r"], permissive: "PERMISSIVE", using: "true" }],
      },
      rbac: {
        table_grants: [{ grantor: "o", grantee: "r", privilege: "SELECT", is_grantable: false }],
        column_grants: [{ column_name: "id", grantor: "o", grantee: "r", privilege: "SELECT", is_grantable: false }],
      },
      triggers: [
        { trigger_name: "trg", action_timing: "BEFORE", event_manipulation: "UPDATE", action_orientation: "ROW", action_statement: "EXECUTE FUNCTION fn()", action_condition: null, action_order: 1 },
      ],
      column_definitions: [
        { column_name: "id", data_type: "integer", not_null: true, column_default: null, comment: "pk", ordinal_position: 1 },
      ],
      constraint_definitions: [
        { constraint_name: "pk", constraint_type: "p", definition: "PRIMARY KEY (id)" },
      ],
      index_definitions: [
        { index_name: "idx", index_definition: "CREATE INDEX idx ON s.full (id)", comment: "fast" },
      ],
      partition_info: null,
      comment: "A table",
    };

    const result = generateTableSQL("s", full);
    for (const section of [
      "DROP (idempotent cleanup)",
      "CREATE TABLE",
      "OWNER",
      "CONSTRAINTS",
      "INDEXES",
      "COMMENTS",
      "ROW LEVEL SECURITY",
      "GRANTS",
      "TRIGGERS",
    ]) {
      assert.ok(result.includes(`-- ${section}`), `Missing section: ${section}`);
    }
  });

  it("should apply role mappings when provided", () => {
    const withGrants: TableData = {
      ...minimalTable,
      rbac: {
        table_grants: [{ grantor: "o", grantee: "visitor", privilege: "SELECT", is_grantable: false }],
        column_grants: [],
      },
    };
    const result = generateTableSQL("s", withGrants, { visitor: ":VISITOR" });
    assert.ok(result.includes(":VISITOR"));
    assert.ok(!result.includes("visitor"));
  });

  it("should include date when includeDate is true", () => {
    const result = generateTableSQL("s", minimalTable, undefined, true);
    assert.match(result, /-- Date: \d{4}-/);
  });

  it("should produce deterministic output (no date)", () => {
    const a = generateTableSQL("s", minimalTable);
    const b = generateTableSQL("s", minimalTable);
    assert.equal(a, b);
  });
});
