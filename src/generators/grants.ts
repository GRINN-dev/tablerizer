import { escapeIdent } from "./utils.js";

/**
 * Generate REVOKE ALL + GRANT statements for table-level privileges.
 * Sorted by grantee, then privilege.
 */
export function generateGrantsSQL(
  schema: string,
  tableName: string,
  grants: Array<{
    grantor: string;
    grantee: string;
    privilege: string;
    is_grantable: boolean;
  }>,
): string[] {
  const sqlStatements: string[] = [];

  if (grants.length === 0) return [];

  // Revoke all first for idempotency
  const grantees = new Set(grants.map((g) => g.grantee));
  const sortedGrantees = Array.from(grantees).sort();

  for (const grantee of sortedGrantees) {
    sqlStatements.push(
      `REVOKE ALL ON TABLE ${schema}.${tableName} FROM ${escapeIdent(grantee)};`,
    );
  }

  sqlStatements.push("");

  // Sort grants for deterministic output
  const sortedGrants = [...grants].sort((a, b) => {
    const granteeCompare = a.grantee.localeCompare(b.grantee);
    if (granteeCompare !== 0) return granteeCompare;
    return a.privilege.localeCompare(b.privilege);
  });

  for (const grant of sortedGrants) {
    let sql = `GRANT ${grant.privilege} ON TABLE ${schema}.${tableName} TO ${escapeIdent(grant.grantee)}`;
    if (grant.is_grantable) {
      sql += " WITH GRANT OPTION";
    }
    sql += ";";
    sqlStatements.push(sql);
  }

  return sqlStatements;
}

/**
 * Generate column-level GRANT statements.
 * Grouped by grantee+privilege, columns sorted alphabetically.
 */
export function generateColumnGrantsSQL(
  schema: string,
  tableName: string,
  columnGrants: Array<{
    column_name: string;
    grantor: string;
    grantee: string;
    privilege: string;
    is_grantable: boolean;
  }>,
): string[] {
  if (columnGrants.length === 0) return [];

  const sqlStatements: string[] = [];

  // Group grants by grantee and privilege type
  const grantsByGranteeAndPrivilege = new Map<string, Set<string>>();

  for (const grant of columnGrants) {
    const key = `${grant.grantee}:${grant.privilege}:${grant.is_grantable}`;
    if (!grantsByGranteeAndPrivilege.has(key)) {
      grantsByGranteeAndPrivilege.set(key, new Set());
    }
    grantsByGranteeAndPrivilege.get(key)!.add(grant.column_name);
  }

  // Sort entries by grantee, then privilege, then grantable for deterministic output
  const sortedEntries = Array.from(grantsByGranteeAndPrivilege.entries()).sort(
    (a, b) => {
      const [granteeA, privilegeA, grantableA] = a[0].split(":");
      const [granteeB, privilegeB, grantableB] = b[0].split(":");
      const granteeCompare = granteeA.localeCompare(granteeB);
      if (granteeCompare !== 0) return granteeCompare;
      const privilegeCompare = privilegeA.localeCompare(privilegeB);
      if (privilegeCompare !== 0) return privilegeCompare;
      return grantableA.localeCompare(grantableB);
    },
  );

  for (const [key, columns] of sortedEntries) {
    const [grantee, privilege, isGrantableStr] = key.split(":");
    const isGrantable = isGrantableStr === "true";

    // Sort columns alphabetically for consistent output
    const sortedColumns = Array.from(columns).sort();
    const escapedColumns = sortedColumns.map((col) => escapeIdent(col));

    let sql = `GRANT ${privilege} (${escapedColumns.join(", ")}) ON TABLE ${schema}.${tableName} TO ${escapeIdent(grantee)}`;
    if (isGrantable) {
      sql += " WITH GRANT OPTION";
    }
    sql += ";";
    sqlStatements.push(sql);
  }

  return sqlStatements;
}
