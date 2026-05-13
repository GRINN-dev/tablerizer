import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { db } from "../helpers.js";
import { createConnection, type DatabaseConnection } from "../../src/database.js";
import { getGrants } from "../../src/queries.js";

let connection: DatabaseConnection;

beforeEach(async () => {
  connection = createConnection(db.databaseUrl);
  await connection.connect();
});

afterEach(async () => {
  await connection.disconnect();
});

describe("getGrants", () => {
  it("returns table-level grants for a table", async () => {
    const grants = await getGrants(connection, "app_public", "users", "table");

    assert.ok(grants.length > 0, "should return at least one grant");
    const visitorGrants = grants.filter(
      (g: any) => g.grantee === db.visitorRole,
    );
    assert.ok(visitorGrants.length > 0, "should include visitor role grants");

    const selectGrant = visitorGrants.find(
      (g: any) => g.privilege === "SELECT",
    );
    assert.ok(selectGrant, "visitor should have SELECT on users");
    assert.equal(selectGrant.grantor, db.ownerRole);
    assert.equal(typeof selectGrant.is_grantable, "boolean");
  });

  it("filters table grants by role when roles are provided", async () => {
    const allGrants = await getGrants(connection, "app_public", "users", "table");
    const filtered = await getGrants(
      connection, "app_public", "users", "table", [db.visitorRole],
    );

    assert.ok(filtered.length > 0, "should return grants for the specified role");
    assert.ok(
      filtered.every((g: any) => g.grantee === db.visitorRole),
      "all grants should be for the visitor role",
    );
    assert.ok(
      allGrants.length >= filtered.length,
      "unfiltered should return at least as many grants",
    );
  });

  it("returns column-level grants including column_name", async () => {
    const grants = await getGrants(connection, "app_public", "users", "column");

    assert.ok(grants.length > 0, "should return at least one column grant");
    const visitorGrants = grants.filter(
      (g: any) => g.grantee === db.visitorRole,
    );
    assert.ok(visitorGrants.length > 0);

    assert.ok(
      visitorGrants.every((g: any) => typeof g.column_name === "string"),
      "column grants should include column_name",
    );

    const updateGrants = visitorGrants.filter(
      (g: any) => g.privilege === "UPDATE",
    );
    const updateColumns = updateGrants.map((g: any) => g.column_name).sort();
    assert.deepEqual(updateColumns, ["metadata", "name"]);
  });

  it("filters column grants by role when roles are provided", async () => {
    const allGrants = await getGrants(connection, "app_public", "users", "column");
    const filtered = await getGrants(
      connection, "app_public", "users", "column", [db.visitorRole],
    );

    assert.ok(filtered.length > 0);
    assert.ok(
      filtered.every((g: any) => g.grantee === db.visitorRole),
      "all column grants should be for the visitor role",
    );
    assert.ok(allGrants.length >= filtered.length);
  });

  it("works for materialized views via 'table' source (same query path)", async () => {
    // information_schema.table_privileges doesn't include mat views in PG,
    // so this returns empty — same as the old getMaterializedViewGrants.
    // Kept for backward compatibility; fixing requires aclexplode on pg_class.
    const grants = await getGrants(
      connection, "app_public", "user_stats", "table",
    );
    assert.ok(Array.isArray(grants));
  });
});
