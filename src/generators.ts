/**
 * SQL generation utilities for Tablerizer v2
 *
 * Generates complete, idempotent DDL for PostgreSQL tables.
 * Each generator is modular and produces deterministic output.
 */

import type {
  ColumnDefinition,
  ConstraintDefinition,
  IndexDefinition,
  PartitionInfo,
  FunctionInfo,
} from "./database.js";

// ============================================================
// TableData interface
// ============================================================

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
  /** pg_catalog column definitions (pg_dump-style exact types) */
  column_definitions: ColumnDefinition[];
  /** pg_catalog constraint definitions (exact via pg_get_constraintdef) */
  constraint_definitions: ConstraintDefinition[];
  /** pg_catalog index definitions */
  index_definitions: IndexDefinition[];
  /** Partition info (null if not partitioned) */
  partition_info: PartitionInfo | null;
  /** Table-level comment */
  comment?: string;
}

// ============================================================
// Utility: escape identifier
// ============================================================

function escapeIdent(name: string): string {
  if (name.includes(" ") || name.includes("-") || name.includes(".")) {
    return `"${name}"`;
  }
  return name;
}

// ============================================================
// Utility: section separator
// ============================================================

function sectionHeader(title: string): string[] {
  return [
    `-- ----------------------------------------`,
    `-- ${title}`,
    `-- ----------------------------------------`,
  ];
}

// ============================================================
// Role mappings
// ============================================================

/**
 * Apply role mappings to SQL content
 */
export function applyRoleMappings(
  content: string,
  roleMappings: Record<string, string>,
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
          placeholder,
        );
      });
    }
  }

  return mappedContent;
}

// ============================================================
// Generator: DROP TABLE
// ============================================================

/**
 * Generate DROP TABLE IF EXISTS ... CASCADE;
 */
export function generateDropTableSQL(
  schema: string,
  tableName: string,
): string[] {
  return [`DROP TABLE IF EXISTS ${schema}.${tableName} CASCADE;`];
}

// ============================================================
// Generator: CREATE TABLE
// ============================================================

/**
 * Generate CREATE TABLE statement with column definitions from pg_catalog.
 * Columns are listed in ordinal_position order (natural table order).
 * NOT NULL constraints are inline. All other constraints are separate.
 */
export function generateCreateTableSQL(
  schema: string,
  tableName: string,
  columns: ColumnDefinition[],
  partitionInfo: PartitionInfo | null,
): string[] {
  if (columns.length === 0) {
    return [`CREATE TABLE ${schema}.${tableName} ();`];
  }

  const lines: string[] = [];
  lines.push(`CREATE TABLE ${schema}.${tableName} (`);

  // Sort by ordinal_position (natural column order from pg_attribute)
  const sortedColumns = [...columns].sort(
    (a, b) => a.ordinal_position - b.ordinal_position,
  );

  const columnLines: string[] = [];
  for (const col of sortedColumns) {
    let line = `    ${escapeIdent(col.column_name)} ${col.data_type}`;

    if (col.not_null) {
      line += " NOT NULL";
    }

    if (col.column_default !== null && col.column_default !== undefined) {
      line += ` DEFAULT ${col.column_default}`;
    }

    columnLines.push(line);
  }

  // Join with commas, last line without comma
  for (let i = 0; i < columnLines.length; i++) {
    if (i < columnLines.length - 1) {
      lines.push(columnLines[i] + ",");
    } else {
      lines.push(columnLines[i]);
    }
  }

  // Close the CREATE TABLE with partition clause if applicable
  if (partitionInfo) {
    const strategyMap: Record<string, string> = {
      r: "RANGE",
      l: "LIST",
      h: "HASH",
    };
    const strategy =
      strategyMap[partitionInfo.partition_strategy] ||
      partitionInfo.partition_strategy.toUpperCase();
    lines.push(`) PARTITION BY ${strategy} (${partitionInfo.partition_key});`);
  } else {
    lines.push(`);`);
  }

  return lines;
}

// ============================================================
// Generator: OWNER
// ============================================================

/**
 * Generate ALTER TABLE ... OWNER TO ...;
 */
export function generateOwnerSQL(
  schema: string,
  tableName: string,
  owner: string,
): string[] {
  return [
    `ALTER TABLE ${schema}.${tableName} OWNER TO ${escapeIdent(owner)};`,
  ];
}

// ============================================================
// Generator: CONSTRAINTS
// ============================================================

/**
 * Generate idempotent constraint statements:
 *   ALTER TABLE ... DROP CONSTRAINT IF EXISTS ...;
 *   ALTER TABLE ... ADD CONSTRAINT ... <definition>;
 *
 * Sorted by type (PK, UNIQUE, FK, CHECK, EXCLUSION), then by name.
 * Filters out system-generated NOT NULL check constraints.
 */
export function generateConstraintsSQL(
  schema: string,
  tableName: string,
  constraints: ConstraintDefinition[],
): string[] {
  if (constraints.length === 0) return [];

  const sqlStatements: string[] = [];

  // Filter out system-generated NOT NULL constraints (they're inline in CREATE TABLE)
  // These typically have names like "tablename_columnname_not_null" and definition "CHECK ((col IS NOT NULL))"
  const userConstraints = constraints.filter((c) => {
    // Skip system-generated check constraints with numeric prefixes
    if (/^\d+_\d+_\d+_.+/.test(c.constraint_name)) return false;
    return true;
  });

  // Already sorted by type then name from the query, but ensure determinism
  const sorted = [...userConstraints].sort((a, b) => {
    const typeOrder: Record<string, number> = {
      p: 1,
      u: 2,
      f: 3,
      c: 4,
      x: 5,
    };
    const typeA = typeOrder[a.constraint_type] ?? 99;
    const typeB = typeOrder[b.constraint_type] ?? 99;
    if (typeA !== typeB) return typeA - typeB;
    return a.constraint_name.localeCompare(b.constraint_name);
  });

  for (const constraint of sorted) {
    const constraintTypeName = {
      p: "PRIMARY KEY",
      u: "UNIQUE",
      f: "FOREIGN KEY",
      c: "CHECK",
      x: "EXCLUSION",
    }[constraint.constraint_type] || constraint.constraint_type;

    sqlStatements.push(
      `-- ${constraintTypeName}: ${constraint.constraint_name}`,
    );
    sqlStatements.push(
      `ALTER TABLE ${schema}.${tableName} DROP CONSTRAINT IF EXISTS ${escapeIdent(constraint.constraint_name)};`,
    );
    sqlStatements.push(
      `ALTER TABLE ${schema}.${tableName} ADD CONSTRAINT ${escapeIdent(constraint.constraint_name)} ${constraint.definition};`,
    );
  }

  return sqlStatements;
}

// ============================================================
// Generator: INDEXES
// ============================================================

/**
 * Generate idempotent index statements:
 *   DROP INDEX IF EXISTS ...;
 *   CREATE INDEX ...;
 *
 * Sorted by index name. Excludes indexes backing constraints (handled by generateConstraintsSQL).
 */
export function generateIndexesSQL(
  schema: string,
  indexes: IndexDefinition[],
): string[] {
  if (indexes.length === 0) return [];

  const sqlStatements: string[] = [];

  // Sort by index name for deterministic output
  const sorted = [...indexes].sort((a, b) =>
    a.index_name.localeCompare(b.index_name),
  );

  for (const idx of sorted) {
    sqlStatements.push(
      `DROP INDEX IF EXISTS ${schema}.${escapeIdent(idx.index_name)};`,
    );
    sqlStatements.push(`${idx.index_definition};`);
  }

  return sqlStatements;
}

// ============================================================
// Generator: COMMENTS
// ============================================================

/**
 * Generate COMMENT ON TABLE and COMMENT ON COLUMN statements.
 * Sorted: table comment first, then columns by ordinal_position.
 */
export function generateCommentsSQL(
  schema: string,
  tableName: string,
  tableComment: string | undefined,
  columns: ColumnDefinition[],
): string[] {
  const sqlStatements: string[] = [];

  if (tableComment) {
    const escapedComment = tableComment.includes("'")
      ? `$$${tableComment}$$`
      : `'${tableComment}'`;
    sqlStatements.push(
      `COMMENT ON TABLE ${schema}.${tableName} IS ${escapedComment};`,
    );
  }

  // Column comments, sorted by ordinal_position (natural order)
  const columnsWithComments = [...columns]
    .filter((c) => c.comment)
    .sort((a, b) => a.ordinal_position - b.ordinal_position);

  for (const col of columnsWithComments) {
    const escapedComment = col.comment!.includes("'")
      ? `$$${col.comment}$$`
      : `'${col.comment}'`;
    sqlStatements.push(
      `COMMENT ON COLUMN ${schema}.${tableName}.${escapeIdent(col.column_name)} IS ${escapedComment};`,
    );
  }

  return sqlStatements;
}

// ============================================================
// Generator: INDEX COMMENTS
// ============================================================

/**
 * Generate COMMENT ON INDEX statements for indexes that have comments.
 */
export function generateIndexCommentsSQL(
  schema: string,
  indexes: IndexDefinition[],
): string[] {
  const sqlStatements: string[] = [];

  const indexesWithComments = [...indexes]
    .filter((idx) => idx.comment)
    .sort((a, b) => a.index_name.localeCompare(b.index_name));

  for (const idx of indexesWithComments) {
    const escapedComment = idx.comment!.includes("'")
      ? `$$${idx.comment}$$`
      : `'${idx.comment}'`;
    sqlStatements.push(
      `COMMENT ON INDEX ${schema}.${escapeIdent(idx.index_name)} IS ${escapedComment};`,
    );
  }

  return sqlStatements;
}

// ============================================================
// Generator: ROW LEVEL SECURITY
// ============================================================

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

// ============================================================
// Generator: TABLE GRANTS
// ============================================================

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

// ============================================================
// Generator: COLUMN GRANTS
// ============================================================

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

// ============================================================
// Generator: TRIGGERS
// ============================================================

/**
 * Generate trigger statements:
 *   DROP TRIGGER IF EXISTS ...;
 *   CREATE TRIGGER ...;
 *
 * Triggers grouped by name (multi-event), sorted alphabetically.
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
  }>,
): string[] {
  if (triggers.length === 0) return [];

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
    const groupKey = `${trigger.trigger_name}|${trigger.action_timing}|${trigger.action_orientation}|${trigger.action_statement}|${trigger.action_condition || ""}`;

    if (triggerGroups.has(groupKey)) {
      triggerGroups.get(groupKey)!.events.push(trigger.event_manipulation);
    } else {
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
    a.trigger_name.localeCompare(b.trigger_name),
  );

  for (const triggerGroup of sortedTriggers) {
    const escapedTriggerName = escapeIdent(triggerGroup.trigger_name);

    // Drop first for idempotency
    sqlStatements.push(
      `DROP TRIGGER IF EXISTS ${escapedTriggerName} ON ${schema}.${tableName};`,
    );

    // Sort events for consistent output
    const sortedEvents = [...triggerGroup.events].sort();
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

// ============================================================
// Main assembler: generateTableSQL
// ============================================================

/**
 * Generate a complete, idempotent SQL file for a table.
 *
 * Sections (in order):
 *   1. Header
 *   2. DROP TABLE
 *   3. CREATE TABLE
 *   4. OWNER
 *   5. CONSTRAINTS (DROP IF EXISTS + ADD)
 *   6. INDEXES (DROP IF EXISTS + CREATE)
 *   7. COMMENTS (TABLE + COLUMN + INDEX)
 *   8. ROW LEVEL SECURITY (ENABLE + POLICIES)
 *   9. GRANTS (TABLE-LEVEL + COLUMN-LEVEL)
 *  10. TRIGGERS (DROP IF EXISTS + CREATE)
 */
export function generateTableSQL(
  schema: string,
  tableData: TableData,
  roleMappings?: Record<string, string>,
  includeDate: boolean = false,
): string {
  const tableName = tableData.table;
  const sections: string[] = [];

  // ---- HEADER ----
  sections.push(`-- ========================================`);
  sections.push(`-- Table: ${schema}.${tableName}`);
  sections.push(`-- Generated by Tablerizer 🎲`);
  if (includeDate) {
    sections.push(`-- Date: ${new Date().toISOString()}`);
  }
  sections.push(`-- ========================================`);
  sections.push("");

  // ---- DROP TABLE ----
  sections.push(...sectionHeader("DROP (idempotent cleanup)"));
  sections.push("");
  sections.push(...generateDropTableSQL(schema, tableName));
  sections.push("");

  // ---- CREATE TABLE ----
  sections.push(...sectionHeader("CREATE TABLE"));
  sections.push("");
  sections.push(
    ...generateCreateTableSQL(
      schema,
      tableName,
      tableData.column_definitions,
      tableData.partition_info,
    ),
  );
  sections.push("");

  // ---- OWNER ----
  sections.push(...sectionHeader("OWNER"));
  sections.push("");
  sections.push(...generateOwnerSQL(schema, tableName, tableData.owner));
  sections.push("");

  // ---- CONSTRAINTS ----
  const constraintsSQL = generateConstraintsSQL(
    schema,
    tableName,
    tableData.constraint_definitions,
  );
  if (constraintsSQL.length > 0) {
    sections.push(...sectionHeader("CONSTRAINTS"));
    sections.push("");
    sections.push(...constraintsSQL);
    sections.push("");
  }

  // ---- INDEXES ----
  const indexesSQL = generateIndexesSQL(schema, tableData.index_definitions);
  if (indexesSQL.length > 0) {
    sections.push(...sectionHeader("INDEXES"));
    sections.push("");
    sections.push(...indexesSQL);
    sections.push("");
  }

  // ---- COMMENTS ----
  const commentsSQL = generateCommentsSQL(
    schema,
    tableName,
    tableData.comment,
    tableData.column_definitions,
  );
  const indexCommentsSQL = generateIndexCommentsSQL(
    schema,
    tableData.index_definitions,
  );
  if (commentsSQL.length > 0 || indexCommentsSQL.length > 0) {
    sections.push(...sectionHeader("COMMENTS"));
    sections.push("");
    if (commentsSQL.length > 0) {
      sections.push(...commentsSQL);
    }
    if (indexCommentsSQL.length > 0) {
      sections.push(...indexCommentsSQL);
    }
    sections.push("");
  }

  // ---- ROW LEVEL SECURITY ----
  if (tableData.rls.enabled || tableData.rls.policies.length > 0) {
    const rlsSQL = generateRlsSQL(
      schema,
      tableName,
      tableData.rls.enabled,
      tableData.rls.force,
      tableData.rls.policies,
    );
    if (rlsSQL.length > 0) {
      sections.push(...sectionHeader("ROW LEVEL SECURITY"));
      sections.push("");
      sections.push(...rlsSQL);
      sections.push("");
    }
  }

  // ---- GRANTS ----
  const tableGrantsSQL = generateGrantsSQL(
    schema,
    tableName,
    tableData.rbac.table_grants,
  );
  const columnGrantsSQL = generateColumnGrantsSQL(
    schema,
    tableName,
    tableData.rbac.column_grants,
  );
  if (tableGrantsSQL.length > 0 || columnGrantsSQL.length > 0) {
    sections.push(...sectionHeader("GRANTS"));
    sections.push("");
    if (tableGrantsSQL.length > 0) {
      sections.push("-- Table-level grants");
      sections.push(...tableGrantsSQL);
    }
    if (columnGrantsSQL.length > 0) {
      if (tableGrantsSQL.length > 0) sections.push("");
      sections.push("-- Column-level grants");
      sections.push(...columnGrantsSQL);
    }
    sections.push("");
  }

  // ---- TRIGGERS ----
  const triggersSQL = generateTriggersSQL(
    schema,
    tableName,
    tableData.triggers,
  );
  if (triggersSQL.length > 0) {
    sections.push(...sectionHeader("TRIGGERS"));
    sections.push("");
    sections.push(...triggersSQL);
    sections.push("");
  }

  let content = sections.join("\n");

  // Apply role mappings if provided
  if (roleMappings && Object.keys(roleMappings).length > 0) {
    content = applyRoleMappings(content, roleMappings);
  }

  return content;
}

// ============================================================
// Function SQL generator (unchanged from v1)
// ============================================================

/**
 * Generate a complete SQL file content for a function
 */
export function generateFunctionSQL(
  func: FunctionInfo,
  roles?: string[],
  roleMappings?: Record<string, string>,
  includeDate: boolean = false,
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
    // Apply role mappings to roles in header for deterministic output
    const displayRoles =
      roleMappings && Object.keys(roleMappings).length > 0
        ? roles.map((role) => roleMappings[role] || role)
        : roles;
    lines.push(`-- Grants for roles: ${displayRoles.join(", ")}`);
  }
  lines.push("");

  // The function definition from PostgreSQL already includes CREATE OR REPLACE
  const funcDef = func.function_definition.trim();
  lines.push(funcDef.endsWith(";") ? funcDef : funcDef + ";");

  // Add comment if it exists
  if (func.comment) {
    lines.push("");
    lines.push(
      `COMMENT ON FUNCTION ${func.schema_name}.${func.function_name}(${func.function_arguments}) IS ${
        func.comment.includes("'")
          ? `$$${func.comment}$$`
          : `'${func.comment}'`
      };`,
    );
  }

  // Add GRANT EXECUTE statements for specified roles
  if (roles && roles.length > 0) {
    lines.push("");
    lines.push("-- Grant execution permissions");
    const sortedRoles = [...roles].sort();
    for (const role of sortedRoles) {
      lines.push(
        `GRANT EXECUTE ON FUNCTION ${func.schema_name}.${func.function_name}(${func.function_arguments}) TO ${escapeIdent(role)};`,
      );
    }
  }

  let content = lines.join("\n");

  if (roleMappings && Object.keys(roleMappings).length > 0) {
    content = applyRoleMappings(content, roleMappings);
  }

  return content;
}

// ============================================================
// Materialized View SQL generator (unchanged from v1)
// ============================================================

/**
 * Generate documentation and grants for a materialized view
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
  includeDate: boolean = false,
): string {
  const lines: string[] = [];

  lines.push(`-- ========================================`);
  lines.push(
    `-- Materialized View: ${matview.schema_name}.${matview.matview_name}`,
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
    `  MATERIALIZED VIEW DOCUMENTATION: ${matview.schema_name}.${matview.matview_name}`,
  );
  lines.push("  " + "=".repeat(65));
  lines.push("");

  if (matview.comment) {
    lines.push(`  Description: ${matview.comment}`);
    lines.push("");
  }

  lines.push(`  Owner: ${matview.owner}`);
  lines.push(
    `  Status: ${matview.is_populated ? "Populated" : "Not Populated"}`,
  );
  lines.push("");

  if (indexes.length > 0) {
    lines.push("  INDEXES:");
    lines.push("  --------");
    const sortedIndexes = [...indexes].sort((a, b) =>
      a.index_name.localeCompare(b.index_name),
    );
    for (const idx of sortedIndexes) {
      lines.push(`  • ${idx.index_name}`);
      lines.push(`    ${idx.index_definition}`);
    }
    lines.push("");
  }

  if (grants.length > 0) {
    lines.push("  PERMISSIONS:");
    lines.push("  ------------");
    const sortedGrants = [...grants].sort((a, b) => {
      const privilegeCompare = a.privilege.localeCompare(b.privilege);
      if (privilegeCompare !== 0) return privilegeCompare;
      return a.grantee.localeCompare(b.grantee);
    });
    for (const grant of sortedGrants) {
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

  // Cleanup section
  lines.push(...sectionHeader("Cleanup (permission idempotency)"));
  lines.push("");

  if (grants.length > 0) {
    const grantees = new Set(grants.map((g) => g.grantee));
    const sortedGrantees = Array.from(grantees).sort();
    for (const grantee of sortedGrantees) {
      lines.push(
        `REVOKE ALL ON TABLE ${matview.schema_name}.${matview.matview_name} FROM ${escapeIdent(grantee)};`,
      );
    }
    lines.push("");
  }

  // Recreation section
  lines.push(...sectionHeader("Grants"));
  lines.push("");

  if (grants.length > 0) {
    const sortedGrants = [...grants].sort((a, b) => {
      const granteeCompare = a.grantee.localeCompare(b.grantee);
      if (granteeCompare !== 0) return granteeCompare;
      return a.privilege.localeCompare(b.privilege);
    });
    for (const grant of sortedGrants) {
      let sql = `GRANT ${grant.privilege} ON TABLE ${matview.schema_name}.${matview.matview_name} TO ${escapeIdent(grant.grantee)}`;
      if (grant.is_grantable) {
        sql += " WITH GRANT OPTION";
      }
      sql += ";";
      lines.push(sql);
    }
    lines.push("");
  }

  let content = lines.join("\n");

  if (roleMappings && Object.keys(roleMappings).length > 0) {
    content = applyRoleMappings(content, roleMappings);
  }

  return content;
}
