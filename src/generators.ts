/**
 * SQL generation utilities for Tablerizer
 */

import type {
  PolicyInfo,
  GrantInfo,
  ColumnGrantInfo,
  TriggerInfo,
  ConstraintInfo,
  ColumnInfo,
  FunctionInfo,
} from "./database.js";

export interface TableData {
  table: string;
  owner: string;
  rls: {
    enabled: boolean;
    force: boolean;
    policies: Array<{
      policy: string;
      cmd: string;
      roles: string[] | null;
      permissive: string;
      using?: string | null;
      with_check?: string | null;
    }>;
  };
  rbac: {
    table_grants: Array<{
      grantor: string;
      grantee: string;
      privilege: string;
      is_grantable: boolean;
    }>;
    column_grants: Array<{
      column_name: string;
      grantor: string;
      grantee: string;
      privilege: string;
      is_grantable: boolean;
    }>;
  };
  triggers: Array<{
    trigger_name: string;
    action_timing: string;
    event_manipulation: string;
    action_orientation: string;
    action_statement: string;
    action_condition: string | null;
    action_order: number;
  }>;
  columns?: ColumnInfo[];
  constraints?: ConstraintInfo[];
  comment?: string;
}

/**
 * Apply role mappings to SQL content
 */
export function applyRoleMappings(
  content: string,
  roleMappings: Record<string, string>
): string {
  let mappedContent = content;

  for (const [actualRole, placeholder] of Object.entries(roleMappings)) {
    // Replace role names in various SQL contexts
    const patterns = [
      // GRANT/REVOKE TO/FROM role
      new RegExp(`\\b(TO|FROM)\\s+"?${actualRole}"?\\b`, "gi"),
      // Role in policy definitions
      new RegExp(`\\b"?${actualRole}"?\\b(?=\\s*[,;)])`, "gi"),
    ];

    for (const pattern of patterns) {
      mappedContent = mappedContent.replace(pattern, (match) => {
        return match.replace(
          new RegExp(`"?${actualRole}"?`, "gi"),
          placeholder
        );
      });
    }
  }

  return mappedContent;
}

/**
 * Generate SQL statements to recreate table grants
 */
export function generateGrantsSQL(
  schema: string,
  tableName: string,
  grants: Array<{
    grantor: string;
    grantee: string;
    privilege: string;
    is_grantable: boolean;
  }>
): string[] {
  const sqlStatements: string[] = [];

  for (const grant of grants) {
    // Escape identifiers if they contain special characters
    const escapedGrantee =
      grant.grantee.includes(" ") || grant.grantee.includes("-")
        ? `"${grant.grantee}"`
        : grant.grantee;

    let sql = `GRANT ${grant.privilege} ON TABLE ${schema}.${tableName} TO ${escapedGrantee}`;
    if (grant.is_grantable) {
      sql += " WITH GRANT OPTION";
    }
    sql += ";";
    sqlStatements.push(sql);
  }

  return sqlStatements;
}

/**
 * Generate SQL statements to recreate column-level grants
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
  }>
): string[] {
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

  // Generate GRANT statements
  for (const [key, columns] of grantsByGranteeAndPrivilege) {
    const [grantee, privilege, isGrantableStr] = key.split(":");
    const isGrantable = isGrantableStr === "true";

    // Escape identifiers if they contain special characters
    const escapedGrantee =
      grantee.includes(" ") || grantee.includes("-") ? `"${grantee}"` : grantee;

    const escapedColumns = Array.from(columns).map((col) =>
      col.includes(" ") || col.includes("-") ? `"${col}"` : col
    );

    let sql = `GRANT ${privilege} (${escapedColumns.join(
      ", "
    )}) ON TABLE ${schema}.${tableName} TO ${escapedGrantee}`;
    if (isGrantable) {
      sql += " WITH GRANT OPTION";
    }
    sql += ";";
    sqlStatements.push(sql);
  }

  return sqlStatements;
}

/**
 * Generate SQL statements to recreate triggers
 */
export function generateTriggersSQL(
  schema: string,
  tableName: string,
  triggers: Array<{
    trigger_name: string;
    action_timing: string;
    event_manipulation: string;
    action_orientation: string;
    action_statement: string;
    action_condition: string | null;
    action_order: number;
  }>
): string[] {
  const sqlStatements: string[] = [];

  // Group triggers by name, timing, orientation, statement, and condition
  const triggerGroups = new Map<
    string,
    {
      trigger_name: string;
      action_timing: string;
      events: string[];
      action_orientation: string;
      action_statement: string;
      action_condition: string | null;
      action_order: number;
    }
  >();

  for (const trigger of triggers) {
    const groupKey = `${trigger.trigger_name}|${trigger.action_timing}|${
      trigger.action_orientation
    }|${trigger.action_statement}|${trigger.action_condition || ""}`;

    if (triggerGroups.has(groupKey)) {
      // Add this event to existing group
      triggerGroups.get(groupKey)!.events.push(trigger.event_manipulation);
    } else {
      // Create new group
      triggerGroups.set(groupKey, {
        trigger_name: trigger.trigger_name,
        action_timing: trigger.action_timing,
        events: [trigger.event_manipulation],
        action_orientation: trigger.action_orientation,
        action_statement: trigger.action_statement,
        action_condition: trigger.action_condition,
        action_order: trigger.action_order,
      });
    }
  }

  // Generate SQL for each trigger group (sorted alphabetically by trigger name)
  const sortedTriggers = Array.from(triggerGroups.values()).sort((a, b) => 
    a.trigger_name.localeCompare(b.trigger_name)
  );
  
  for (const triggerGroup of sortedTriggers) {
    // Escape trigger name if it contains special characters
    const escapedTriggerName =
      triggerGroup.trigger_name.includes(" ") ||
      triggerGroup.trigger_name.includes("-")
        ? `"${triggerGroup.trigger_name}"`
        : triggerGroup.trigger_name;

    // Sort events for consistent output (INSERT before UPDATE, etc.)
    const sortedEvents = triggerGroup.events.sort();
    const eventString = sortedEvents.join(" OR ");

    let sql = `CREATE TRIGGER ${escapedTriggerName}`;
    sql += ` ${triggerGroup.action_timing} ${eventString}`;
    sql += ` ON ${schema}.${tableName}`;
    sql += ` FOR EACH ${triggerGroup.action_orientation}`;

    if (triggerGroup.action_condition) {
      sql += ` WHEN (${triggerGroup.action_condition})`;
    }

    sql += ` ${triggerGroup.action_statement};`;
    sqlStatements.push(sql);
  }

  return sqlStatements;
}

/**
 * Generate SQL statements to recreate RLS policies
 */
export function generatePoliciesSQL(
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
  }>
): string[] {
  const sqlStatements: string[] = [];

  // Enable RLS if needed
  if (rlsEnabled) {
    sqlStatements.push(
      `ALTER TABLE ${schema}.${tableName} ENABLE ROW LEVEL SECURITY;`
    );
  }

  if (rlsForce) {
    sqlStatements.push(
      `ALTER TABLE ${schema}.${tableName} FORCE ROW LEVEL SECURITY;`
    );
  }

  // Create policies (sorted alphabetically by policy name)
  const sortedPolicies = policies.sort((a, b) => a.policy.localeCompare(b.policy));
  
  for (const policy of sortedPolicies) {
    // Escape policy name if it contains special characters
    const escapedPolicyName =
      policy.policy.includes(" ") || policy.policy.includes("-")
        ? `"${policy.policy}"`
        : policy.policy;

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
      // Escape role names if needed
      const escapedRoles = policy.roles.map((role) =>
        role.includes(" ") || role.includes("-") ? `"${role}"` : role
      );
      sql += ` TO ${escapedRoles.join(", ")}`;
    }
    // If no roles specified, the policy applies to PUBLIC (default behavior)

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

/**
 * Generate schema documentation section for a table
 */
export function generateSchemaDocumentation(
  schema: string,
  tableName: string,
  columns?: ColumnInfo[],
  constraints?: ConstraintInfo[],
  tableComment?: string
): string[] {
  const docs: string[] = [];

  docs.push("");
  docs.push("/*");
  docs.push(`  TABLE SCHEMA DOCUMENTATION: ${schema}.${tableName}`);
  docs.push("  " + "=".repeat(60));

  if (tableComment) {
    docs.push(`  Table Comment: ${tableComment}`);
    docs.push("");
  }

  if (columns && columns.length > 0) {
    docs.push("  COLUMNS:");
    docs.push("  --------");

    for (const col of columns) {
      let colDoc = `  • ${col.column_name}: ${col.data_type}`;

      if (col.character_maximum_length) {
        colDoc += `(${col.character_maximum_length})`;
      } else if (col.numeric_precision && col.numeric_scale !== null) {
        colDoc += `(${col.numeric_precision},${col.numeric_scale})`;
      } else if (col.numeric_precision) {
        colDoc += `(${col.numeric_precision})`;
      }

      if (col.is_nullable === "NO") {
        colDoc += " NOT NULL";
      }

      if (col.column_default) {
        colDoc += ` DEFAULT ${col.column_default}`;
      }

      if (col.comment) {
        colDoc += ` -- ${col.comment}`;
      }

      docs.push(colDoc);
    }
    docs.push("");
  }

  if (constraints && constraints.length > 0) {
    const primaryKeys = constraints.filter(
      (c) => c.constraint_type === "PRIMARY KEY"
    );
    const foreignKeys = constraints.filter(
      (c) => c.constraint_type === "FOREIGN KEY"
    );
    const uniqueKeys = constraints.filter(
      (c) => c.constraint_type === "UNIQUE"
    );
    const checkConstraints = constraints.filter(
      (c) => c.constraint_type === "CHECK"
    );

    if (primaryKeys.length > 0) {
      docs.push("  PRIMARY KEY:");
      primaryKeys.forEach((pk) => {
        docs.push(`  • ${pk.constraint_name}: ${pk.column_name}`);
      });
      docs.push("");
    }

    if (foreignKeys.length > 0) {
      docs.push("  FOREIGN KEYS:");
      foreignKeys.forEach((fk) => {
        docs.push(
          `  • ${fk.constraint_name}: ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`
        );
      });
      docs.push("");
    }

    if (uniqueKeys.length > 0) {
      docs.push("  UNIQUE CONSTRAINTS:");
      uniqueKeys.forEach((uk) => {
        docs.push(`  • ${uk.constraint_name}: ${uk.column_name}`);
      });
      docs.push("");
    }

    if (checkConstraints.length > 0) {
      // Filter out system-generated constraints with numeric prefixes
      const userConstraints = checkConstraints.filter(cc => {
        // Skip constraints that start with numbers (system-generated)
        // Pattern: digit_digit_digit_constraint_type
        return !/^\d+_\d+_\d+_.+/.test(cc.constraint_name);
      });
      
      if (userConstraints.length > 0) {
        docs.push("  CHECK CONSTRAINTS:");
        userConstraints.forEach((cc) => {
          docs.push(`  • ${cc.constraint_name}: ${cc.check_clause}`);
        });
        docs.push("");
      }
    }
  }

  docs.push("*/");
  docs.push("");

  return docs;
}

/**
 * Generate a complete SQL file content for a table
 */
export function generateTableSQL(
  schema: string,
  tableData: TableData,
  roleMappings?: Record<string, string>,
  includeDate: boolean = false
): string {
  const tableName = tableData.table;
  const sections: string[] = [];

  // Header comment
  sections.push(`-- ========================================`);
  sections.push(`-- Table: ${schema}.${tableName}`);
  sections.push(`-- Generated by Tablerizer 🎲`);
  if (includeDate) {
    sections.push(`-- Date: ${new Date().toISOString()}`);
  }
  sections.push(`-- ========================================`);
  sections.push("");

  // Cleanup section (for idempotency)
  sections.push("-- 🧹 Cleanup Section (for idempotency)");
  sections.push("-- =======================================");
  sections.push("");

  // Drop existing policies
  if (tableData.rls.policies.length > 0) {
    for (const policy of tableData.rls.policies) {
      const escapedPolicyName =
        policy.policy.includes(" ") || policy.policy.includes("-")
          ? `"${policy.policy}"`
          : policy.policy;
      sections.push(
        `DROP POLICY IF EXISTS ${escapedPolicyName} ON ${schema}.${tableName};`
      );
    }
    sections.push("");
  }

  // Drop existing triggers
  if (tableData.triggers.length > 0) {
    const uniqueTriggerNames = new Set(
      tableData.triggers.map((t) => t.trigger_name)
    );
    for (const triggerName of uniqueTriggerNames) {
      const escapedTriggerName =
        triggerName.includes(" ") || triggerName.includes("-")
          ? `"${triggerName}"`
          : triggerName;
      sections.push(
        `DROP TRIGGER IF EXISTS ${escapedTriggerName} ON ${schema}.${tableName};`
      );
    }
    sections.push("");
  }

  // Revoke existing grants
  if (
    tableData.rbac.table_grants.length > 0 ||
    tableData.rbac.column_grants.length > 0
  ) {
    sections.push("-- Revoke existing grants");

    // Get unique grantees
    const tableGrantees = new Set(
      tableData.rbac.table_grants.map((g) => g.grantee)
    );
    const columnGrantees = new Set(
      tableData.rbac.column_grants.map((g) => g.grantee)
    );
    const allGrantees = new Set([...tableGrantees, ...columnGrantees]);

    for (const grantee of allGrantees) {
      const escapedGrantee =
        grantee.includes(" ") || grantee.includes("-")
          ? `"${grantee}"`
          : grantee;
      sections.push(
        `REVOKE ALL ON TABLE ${schema}.${tableName} FROM ${escapedGrantee};`
      );
    }
    sections.push("");
  }

  // Disable RLS
  if (tableData.rls.enabled) {
    sections.push(
      `ALTER TABLE ${schema}.${tableName} DISABLE ROW LEVEL SECURITY;`
    );
    sections.push("");
  }

  // Recreation section
  sections.push("-- ⚡ Recreation Section");
  sections.push("-- ====================");
  sections.push("");

  // Generate table grants
  if (tableData.rbac.table_grants.length > 0) {
    sections.push("-- Table-level grants");
    const grantsSQL = generateGrantsSQL(
      schema,
      tableName,
      tableData.rbac.table_grants
    );
    sections.push(...grantsSQL);
    sections.push("");
  }

  // Generate column grants
  if (tableData.rbac.column_grants.length > 0) {
    sections.push("-- Column-level grants");
    const columnGrantsSQL = generateColumnGrantsSQL(
      schema,
      tableName,
      tableData.rbac.column_grants
    );
    sections.push(...columnGrantsSQL);
    sections.push("");
  }

  // Generate RLS policies
  if (tableData.rls.enabled || tableData.rls.policies.length > 0) {
    sections.push("-- Row Level Security policies");
    const policiesSQL = generatePoliciesSQL(
      schema,
      tableName,
      tableData.rls.enabled,
      tableData.rls.force,
      tableData.rls.policies
    );
    sections.push(...policiesSQL);
    sections.push("");
  }

  // Generate triggers
  if (tableData.triggers.length > 0) {
    sections.push("-- Triggers");
    const triggersSQL = generateTriggersSQL(
      schema,
      tableName,
      tableData.triggers
    );
    sections.push(...triggersSQL);
    sections.push("");
  }

  // Add schema documentation
  const schemaDoc = generateSchemaDocumentation(
    schema,
    tableName,
    tableData.columns,
    tableData.constraints,
    tableData.comment
  );
  sections.push(...schemaDoc);

  let content = sections.join("\n");

  // Apply role mappings if provided
  if (roleMappings && Object.keys(roleMappings).length > 0) {
    content = applyRoleMappings(content, roleMappings);
  }

  return content;
}

/**
 * Generate a complete SQL file content for a function
 */
export function generateFunctionSQL(
  func: FunctionInfo,
  roles?: string[],
  roleMappings?: Record<string, string>,
  includeDate: boolean = false
): string {
  const lines: string[] = [];

  lines.push(`-- ========================================`);
  lines.push(`-- Function: ${func.schema_name}.${func.function_name}`);
  lines.push(`-- Generated by Tablerizer 🎲`);
  if (includeDate) {
    lines.push(`-- Date: ${new Date().toISOString()}`);
  }
  lines.push(`-- ========================================`);
  lines.push(`-- Type: ${func.function_type}`);
  lines.push(`-- Language: ${func.language}`);
  if (func.comment) {
    lines.push(`-- Comment: ${func.comment}`);
  }
  if (roles && roles.length > 0) {
    lines.push(`-- Grants for roles: ${roles.join(", ")}`);
  }
  lines.push("");

  // The function definition from PostgreSQL already includes CREATE OR REPLACE
  // and proper formatting, so we can use it directly
  lines.push(func.function_definition);

  // Add comment if it exists
  if (func.comment) {
    lines.push("");
    lines.push(
      `COMMENT ON FUNCTION ${func.schema_name}.${func.function_name}(${
        func.function_arguments
      }) IS ${
        func.comment.includes("'") ? `$$${func.comment}$$` : `'${func.comment}'`
      };`
    );
  }

  // Add GRANT EXECUTE statements for specified roles
  if (roles && roles.length > 0) {
    lines.push("");
    lines.push("-- Grant execution permissions");
    for (const role of roles) {
      // Escape role name if it contains special characters
      const escapedRole =
        role.includes(" ") || role.includes("-") ? `"${role}"` : role;
      lines.push(
        `GRANT EXECUTE ON FUNCTION ${func.schema_name}.${func.function_name}(${func.function_arguments}) TO ${escapedRole};`
      );
    }
  }

  let content = lines.join("\n");

  // Apply role mappings if provided
  if (roleMappings && Object.keys(roleMappings).length > 0) {
    content = applyRoleMappings(content, roleMappings);
  }

  return content;
}

/**
 * Generate documentation and grants for a materialized view (no SQL code)
 */
export function generateMaterializedViewSQL(
  matview: import("./database.js").MaterializedViewInfo,
  grants: Array<{
    grantor: string;
    grantee: string;
    privilege: string;
    is_grantable: boolean;
  }>,
  indexes: Array<{
    index_name: string;
    index_definition: string;
  }>,
  roleMappings?: Record<string, string>,
  includeDate: boolean = false
): string {
  const lines: string[] = [];

  lines.push(`-- ========================================`);
  lines.push(
    `-- Materialized View: ${matview.schema_name}.${matview.matview_name}`
  );
  lines.push(`-- Generated by Tablerizer 🎲`);
  if (includeDate) {
    lines.push(`-- Date: ${new Date().toISOString()}`);
  }
  lines.push(`-- ========================================`);
  lines.push(`-- Owner: ${matview.owner}`);
  lines.push(`-- Populated: ${matview.is_populated ? "Yes" : "No"}`);
  if (matview.comment) {
    lines.push(`-- Comment: ${matview.comment}`);
  }
  lines.push("");

  // Documentation section
  lines.push("/*");
  lines.push(
    `  MATERIALIZED VIEW DOCUMENTATION: ${matview.schema_name}.${matview.matview_name}`
  );
  lines.push("  " + "=".repeat(65));
  lines.push("");

  if (matview.comment) {
    lines.push(`  Description: ${matview.comment}`);
    lines.push("");
  }

  lines.push(`  Owner: ${matview.owner}`);
  lines.push(
    `  Status: ${matview.is_populated ? "Populated" : "Not Populated"}`
  );
  lines.push("");

  // Indexes section
  if (indexes.length > 0) {
    lines.push("  INDEXES:");
    lines.push("  --------");
    for (const idx of indexes) {
      lines.push(`  • ${idx.index_name}`);
      lines.push(`    ${idx.index_definition}`);
    }
    lines.push("");
  }

  // Grants section
  if (grants.length > 0) {
    lines.push("  PERMISSIONS:");
    lines.push("  ------------");
    for (const grant of grants) {
      const grantableText = grant.is_grantable ? " (GRANTABLE)" : "";
      lines.push(`  • ${grant.privilege} → ${grant.grantee}${grantableText}`);
    }
    lines.push("");
  }

  lines.push("  NOTE: This materialized view definition is not exported");
  lines.push("        as it's considered stateful. Only metadata and");
  lines.push("        permissions are documented here.");
  lines.push("*/");
  lines.push("");

  // Cleanup section (for permissions management)
  lines.push("-- 🧹 Cleanup Section (for permission idempotency)");
  lines.push("-- ===============================================");
  lines.push("");

  // Revoke existing grants
  if (grants.length > 0) {
    const grantees = new Set(grants.map((g) => g.grantee));
    for (const grantee of grantees) {
      const escapedGrantee =
        grantee.includes(" ") || grantee.includes("-")
          ? `"${grantee}"`
          : grantee;
      lines.push(
        `REVOKE ALL ON TABLE ${matview.schema_name}.${matview.matview_name} FROM ${escapedGrantee};`
      );
    }
    lines.push("");
  }

  // Recreation section
  lines.push("-- ⚡ Recreation Section (Permissions Only)");
  lines.push("-- ========================================");
  lines.push("");

  // Generate grants
  if (grants.length > 0) {
    lines.push("-- Materialized view grants");
    for (const grant of grants) {
      const escapedGrantee =
        grant.grantee.includes(" ") || grant.grantee.includes("-")
          ? `"${grant.grantee}"`
          : grant.grantee;

      let sql = `GRANT ${grant.privilege} ON TABLE ${matview.schema_name}.${matview.matview_name} TO ${escapedGrantee}`;
      if (grant.is_grantable) {
        sql += " WITH GRANT OPTION";
      }
      sql += ";";
      lines.push(sql);
    }
    lines.push("");
  }

  let content = lines.join("\n");

  // Apply role mappings if provided
  if (roleMappings && Object.keys(roleMappings).length > 0) {
    content = applyRoleMappings(content, roleMappings);
  }

  return content;
}
