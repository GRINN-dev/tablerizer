import { escapeIdent } from "./utils.js";

/**
 * Generate RLS statements:
 *   ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE ... FORCE ROW LEVEL SECURITY;
 *   DROP POLICY IF EXISTS ...;
 *   CREATE POLICY ...;
 *
 * Policies sorted alphabetically by name.
 */
export function generateRlsSQL(
  schema: string,
  tableName: string,
  rlsEnabled: boolean,
  rlsForce: boolean,
  policies: Array<{
    policy: string;
    cmd: string;
    roles: string[] | null;
    permissive: string;
    using?: string | null;
    with_check?: string | null;
  }>,
): string[] {
  const sqlStatements: string[] = [];

  // Enable RLS if needed
  if (rlsEnabled) {
    sqlStatements.push(
      `ALTER TABLE ${schema}.${tableName} ENABLE ROW LEVEL SECURITY;`,
    );
  }

  if (rlsForce) {
    sqlStatements.push(
      `ALTER TABLE ${schema}.${tableName} FORCE ROW LEVEL SECURITY;`,
    );
  }

  if (sqlStatements.length > 0 && policies.length > 0) {
    sqlStatements.push("");
  }

  // Create policies (sorted alphabetically by policy name)
  const sortedPolicies = [...policies].sort((a, b) =>
    a.policy.localeCompare(b.policy),
  );

  for (const policy of sortedPolicies) {
    const escapedPolicyName = escapeIdent(policy.policy);

    // Drop first for idempotency
    sqlStatements.push(
      `DROP POLICY IF EXISTS ${escapedPolicyName} ON ${schema}.${tableName};`,
    );

    let sql = `CREATE POLICY ${escapedPolicyName} ON ${schema}.${tableName}`;

    if (policy.permissive === "RESTRICTIVE") {
      sql += " AS RESTRICTIVE";
    }

    sql += ` FOR ${policy.cmd}`;

    if (
      policy.roles &&
      Array.isArray(policy.roles) &&
      policy.roles.length > 0
    ) {
      const escapedRoles = [...policy.roles]
        .sort()
        .map((role) => escapeIdent(role));
      sql += ` TO ${escapedRoles.join(", ")}`;
    }

    if (policy.using) {
      sql += ` USING (${policy.using})`;
    }

    if (policy.with_check) {
      sql += ` WITH CHECK (${policy.with_check})`;
    }

    sql += ";";
    sqlStatements.push(sql);
  }

  return sqlStatements;
}
