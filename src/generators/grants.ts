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

interface ColumnGrantGroup {
  grantee: string;
  privilege: string;
  is_grantable: boolean;
  columns: Set<string>;
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

  const groups = new Map<string, ColumnGrantGroup>();

  for (const grant of columnGrants) {
    const key = JSON.stringify([grant.grantee, grant.privilege, grant.is_grantable]);
    let group = groups.get(key);
    if (!group) {
      group = { grantee: grant.grantee, privilege: grant.privilege, is_grantable: grant.is_grantable, columns: new Set() };
      groups.set(key, group);
    }
    group.columns.add(grant.column_name);
  }

  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    const granteeCompare = a.grantee.localeCompare(b.grantee);
    if (granteeCompare !== 0) return granteeCompare;
    const privilegeCompare = a.privilege.localeCompare(b.privilege);
    if (privilegeCompare !== 0) return privilegeCompare;
    return String(a.is_grantable).localeCompare(String(b.is_grantable));
  });

  for (const group of sortedGroups) {
    const sortedColumns = Array.from(group.columns).sort();
    const escapedColumns = sortedColumns.map((col) => escapeIdent(col));

    let sql = `GRANT ${group.privilege} (${escapedColumns.join(", ")}) ON TABLE ${schema}.${tableName} TO ${escapeIdent(group.grantee)}`;
    if (group.is_grantable) {
      sql += " WITH GRANT OPTION";
    }
    sql += ";";
    sqlStatements.push(sql);
  }

  return sqlStatements;
}
