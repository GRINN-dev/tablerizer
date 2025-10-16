#!/usr/bin/env ts-node

/**
 * Generate SQL files to recreate RBAC (table privileges) and RLS (policies) for all tables in schemas.
 *
 * Usage:
 *   ts-node index.ts --schemas "schema1,schema2" --out ./sql_output
 *   ts-node index.ts --schema public --role my_role
 *   ts-node index.ts --schemas "public,priv" --roles "role1,role2,role3"
 *   DATABASE_URL=postgres://user:pass@host:5432/db ts-node index.ts --schemas "my_schema"
 *
 * Options:
 *   --schema   Target schema name (legacy, use --schemas instead)
 *   --schemas  Target schema names, comma-separated (recommended)
 *   --out      Output directory (default: ./tables/)
 *   --role     Filter grants by specific role (optional)
 *   --roles    Filter grants by multiple roles, comma-separated (optional)
 */

import fs from "fs";
import path from "path";
import { Client } from "pg";

type Args = {
  schemas: string[];
  out?: string;
  roles?: string[];
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { schemas: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === "--schema") {
      // Legacy support for single schema
      out.schemas = [next];
      i++;
      continue;
    }
    if (a === "--schemas") {
      out.schemas = next.split(",").map((s) => s.trim());
      i++;
      continue;
    }
    if (a === "--out") {
      out.out = next;
      i++;
      continue;
    }
    if (a === "--role" || a === "--roles") {
      out.roles = next.split(",").map((r) => r.trim());
      i++;
      continue;
    }
  }
  if (out.schemas.length === 0) {
    console.error("ERROR: --schema or --schemas is required");
    process.exit(1);
  }
  return out;
}

/**
 * Generate SQL statements to recreate table grants
 */
function generateGrantsSQL(
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
function generateColumnGrantsSQL(
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
function generateTriggersSQL(
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

  // Generate SQL for each trigger group
  for (const triggerGroup of triggerGroups.values()) {
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
function generatePoliciesSQL(
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

  // Create policies
  for (const policy of policies) {
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
 * Generate a complete SQL file content for a table
 */
function generateTableSQL(
  schema: string,
  table: {
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
    columns?: Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      character_maximum_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
    }>;
    foreign_keys?: Array<{
      constraint_name: string;
      column_name: string;
      foreign_table_schema: string;
      foreign_table_name: string;
      foreign_column_name: string;
      update_rule: string;
      delete_rule: string;
    }>;
    constraints?: Array<{
      constraint_name: string;
      constraint_type: string;
      column_name: string | null;
      check_clause: string | null;
    }>;
    comments?: Array<{
      column_name: string | null;
      comment: string;
      comment_type: string;
    }>;
  },
  roles?: string[]
): string {
  const lines: string[] = [];

  lines.push(`-- RBAC & RLS recreation script for ${schema}.${table.table}`);
  lines.push(`-- Generated at: ${new Date().toISOString()}`);
  lines.push(`-- Table owner: ${table.owner}`);
  if (roles && roles.length > 0) {
    lines.push(`-- Filtered for roles: ${roles.join(", ")}`);
  }
  lines.push("");

  // Add cleanup section for idempotency
  lines.push("-- ============================================");
  lines.push("-- CLEANUP: Make script idempotent");
  lines.push("-- ============================================");
  lines.push("");

  // 1. Drop existing policies
  lines.push("-- Drop existing policies");
  lines.push("DO $$");
  lines.push("DECLARE");
  lines.push("    policy_name text;");
  lines.push("BEGIN");
  lines.push("    FOR policy_name IN");
  lines.push(`        SELECT policyname`);
  lines.push(`        FROM pg_policies`);
  lines.push(
    `        WHERE tablename = '${table.table}' AND schemaname = '${schema}'`
  );
  lines.push("    LOOP");
  lines.push(
    `        EXECUTE format('DROP POLICY %I ON ${schema}.${table.table};', policy_name);`
  );
  lines.push("    END LOOP;");
  lines.push("END $$;");
  lines.push("");

  // 2. Drop existing triggers
  lines.push("-- Drop existing triggers");
  lines.push("DO $$");
  lines.push("DECLARE");
  lines.push("    trigger_name text;");
  lines.push("BEGIN");
  lines.push("    FOR trigger_name IN");
  lines.push(`        SELECT tgname`);
  lines.push(`        FROM pg_trigger t`);
  lines.push(`        JOIN pg_class c ON c.oid = t.tgrelid`);
  lines.push(`        JOIN pg_namespace n ON n.oid = c.relnamespace`);
  lines.push(
    `        WHERE c.relname = '${table.table}' AND n.nspname = '${schema}'`
  );
  lines.push(`        AND NOT t.tgisinternal`);
  lines.push("    LOOP");
  lines.push(
    `        EXECUTE format('DROP TRIGGER %I ON ${schema}.${table.table};', trigger_name);`
  );
  lines.push("    END LOOP;");
  lines.push("END $$;");
  lines.push("");

  // 3. Revoke existing grants
  if (roles && roles.length > 0) {
    // Only revoke from specified roles
    for (const role of roles) {
      const escapedRole =
        role.includes(" ") || role.includes("-") ? `"${role}"` : role;
      lines.push(`-- Revoke all privileges from ${role}`);
      lines.push(
        `REVOKE ALL ON TABLE ${schema}.${table.table} FROM ${escapedRole};`
      );
    }
  } else {
    // Get all grantees and revoke from them
    const allGrantees = new Set<string>();
    table.rbac.table_grants.forEach((g) => allGrantees.add(g.grantee));
    table.rbac.column_grants.forEach((g) => allGrantees.add(g.grantee));

    if (allGrantees.size > 0) {
      lines.push("-- Revoke all privileges from existing grantees");
      for (const grantee of allGrantees) {
        const escapedGrantee =
          grantee.includes(" ") || grantee.includes("-")
            ? `"${grantee}"`
            : grantee;
        lines.push(
          `REVOKE ALL ON TABLE ${schema}.${table.table} FROM ${escapedGrantee};`
        );
      }
    }
  }
  lines.push("");

  lines.push("-- ============================================");
  lines.push("-- RECREATION: Apply new configuration");
  lines.push("-- ============================================");
  lines.push("");

  // Generate RLS and policies SQL
  const rlsSQL = generatePoliciesSQL(
    schema,
    table.table,
    table.rls.enabled,
    table.rls.force,
    table.rls.policies
  );

  if (rlsSQL.length > 0) {
    lines.push("-- Row Level Security and Policies");
    lines.push(...rlsSQL);
    lines.push("");
  }

  // Generate grants SQL
  const grantsSQL = generateGrantsSQL(
    schema,
    table.table,
    table.rbac.table_grants
  );

  if (grantsSQL.length > 0) {
    lines.push("-- Table Grants");
    lines.push(...grantsSQL);
    lines.push("");
  }

  // Generate column grants SQL
  const columnGrantsSQL = generateColumnGrantsSQL(
    schema,
    table.table,
    table.rbac.column_grants
  );

  if (columnGrantsSQL.length > 0) {
    lines.push("-- Column Grants");
    lines.push(...columnGrantsSQL);
    lines.push("");
  }

  // Generate triggers SQL
  const triggersSQL = generateTriggersSQL(schema, table.table, table.triggers);

  if (triggersSQL.length > 0) {
    lines.push("-- Triggers");
    lines.push(...triggersSQL);
    lines.push("");
  }

  if (
    rlsSQL.length === 0 &&
    grantsSQL.length === 0 &&
    columnGrantsSQL.length === 0 &&
    triggersSQL.length === 0
  ) {
    lines.push(
      "-- No RLS policies, table grants, column grants, or triggers found for this table"
    );
  }

  // Add table schema information as comments
  if (table.columns && table.columns.length > 0) {
    lines.push("");
    lines.push("-- ============================================");
    lines.push("-- TABLE SCHEMA INFORMATION");
    lines.push("-- ============================================");
    lines.push("");
    lines.push(`-- Table: ${schema}.${table.table}`);
    lines.push(`-- Owner: ${table.owner}`);
    lines.push(`-- Columns: ${table.columns.length}`);
    lines.push("");

    // Add table comments if they exist
    if (table.comments) {
      const tableComments = table.comments.filter(
        (c) => c.comment_type === "TABLE"
      );
      if (tableComments.length > 0) {
        for (const comment of tableComments) {
          lines.push(
            `COMMENT ON TABLE ${schema}.${table.table} IS ${
              comment.comment
                ? `'${comment.comment.replace(/'/g, "''")}'`
                : "NULL"
            };`
          );
        }
        lines.push("");
      }
    }

    // Add column definitions
    for (const col of table.columns) {
      let columnDef = `-- ${col.column_name}`;

      // Build type information
      let typeInfo = col.data_type;
      if (col.character_maximum_length) {
        typeInfo += `(${col.character_maximum_length})`;
      } else if (col.numeric_precision && col.numeric_scale) {
        typeInfo += `(${col.numeric_precision},${col.numeric_scale})`;
      } else if (col.numeric_precision) {
        typeInfo += `(${col.numeric_precision})`;
      }

      columnDef += ` ${typeInfo}`;

      // Add nullable/not null
      if (col.is_nullable === "NO") {
        columnDef += " NOT NULL";
      }

      // Add default if exists
      if (col.column_default) {
        columnDef += ` DEFAULT ${col.column_default}`;
      }

      lines.push(columnDef);

      // Add column comments if they exist
      if (table.comments) {
        const columnComments = table.comments.filter(
          (c) =>
            c.comment_type === "COLUMN" && c.column_name === col.column_name
        );
        for (const comment of columnComments) {
          lines.push(
            `COMMENT ON COLUMN ${schema}.${table.table}.${col.column_name} IS ${
              comment.comment
                ? `'${comment.comment.replace(/'/g, "''")}'`
                : "NULL"
            };`
          );
        }
      }
    }

    // Add foreign key constraints
    if (table.foreign_keys && table.foreign_keys.length > 0) {
      lines.push("");
      lines.push("-- Foreign Key Constraints:");
      const fkGroups = new Map<string, Array<(typeof table.foreign_keys)[0]>>();

      // Group foreign keys by constraint name
      for (const fk of table.foreign_keys) {
        if (!fkGroups.has(fk.constraint_name)) {
          fkGroups.set(fk.constraint_name, []);
        }
        fkGroups.get(fk.constraint_name)!.push(fk);
      }

      for (const [constraintName, fks] of fkGroups.entries()) {
        const sourceColumns = fks.map((fk) => fk.column_name).join(", ");
        const targetColumns = fks
          .map((fk) => fk.foreign_column_name)
          .join(", ");
        const targetTable = `${fks[0].foreign_table_schema}.${fks[0].foreign_table_name}`;

        let fkDef = `-- ${constraintName}: (${sourceColumns}) -> ${targetTable}(${targetColumns})`;
        if (
          fks[0].update_rule !== "NO ACTION" ||
          fks[0].delete_rule !== "NO ACTION"
        ) {
          fkDef += ` [UPDATE: ${fks[0].update_rule}, DELETE: ${fks[0].delete_rule}]`;
        }
        lines.push(fkDef);
      }
    }

    // Add other constraints
    if (table.constraints && table.constraints.length > 0) {
      lines.push("");
      lines.push("-- Constraints:");

      const constraintGroups = new Map<
        string,
        Array<(typeof table.constraints)[0]>
      >();

      // Group constraints by name and type
      for (const constraint of table.constraints) {
        const key = `${constraint.constraint_name}:${constraint.constraint_type}`;
        if (!constraintGroups.has(key)) {
          constraintGroups.set(key, []);
        }
        constraintGroups.get(key)!.push(constraint);
      }

      for (const [key, constraints] of constraintGroups.entries()) {
        const [constraintName, constraintType] = key.split(":");
        const constraint = constraints[0];

        if (constraintType === "PRIMARY KEY") {
          const columns = constraints
            .filter((c) => c.column_name)
            .map((c) => c.column_name)
            .join(", ");
          lines.push(`-- ${constraintName}: PRIMARY KEY (${columns})`);
        } else if (constraintType === "UNIQUE") {
          const columns = constraints
            .filter((c) => c.column_name)
            .map((c) => c.column_name)
            .join(", ");
          lines.push(`-- ${constraintName}: UNIQUE (${columns})`);
        } else if (constraintType === "CHECK") {
          lines.push(
            `-- ${constraintName}: CHECK ${constraint.check_clause || ""}`
          );
        }
      }
    }
  }

  return lines.join("\n");
}

async function main() {
  const { schemas, out, roles } = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(
      "ERROR: set DATABASE_URL (e.g., postgres://user:pass@host:5432/db)"
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const baseOutputDir = out || "./tables";
    let totalFiles = 0;

    for (const schema of schemas) {
      console.log(`\nProcessing schema: ${schema}`);

      // Create schema-specific output directory
      const schemaOutputDir = path.join(baseOutputDir, schema);
      if (!fs.existsSync(schemaOutputDir)) {
        fs.mkdirSync(schemaOutputDir, { recursive: true });
      }

      // 1) List all ordinary tables in the schema with owner and RLS flags
      const tablesRes = await client.query<{
        oid: number;
        schema: string;
        table_name: string;
        owner: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `
        select
          c.oid,
          n.nspname as schema,
          c.relname as table_name,
          r.rolname as owner,
          c.relrowsecurity,
          c.relforcerowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_roles r on r.oid = c.relowner
        where c.relkind = 'r'  -- ordinary tables
          and n.nspname = $1
        order by c.relname;
        `,
        [schema]
      );

      // 2) Table-level grants (RBAC) via information_schema
      const tableGrantsQuery = `
        select
          table_schema,
          table_name,
          grantor,
          grantee,
          privilege_type,
          is_grantable
        from information_schema.role_table_grants
        where table_schema = $1
          and privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
          ${roles && roles.length > 0 ? `and grantee = ANY($2)` : ""}
        order by table_name, grantee, privilege_type;
      `;

      const grantsRes = await client.query<{
        table_schema: string;
        table_name: string;
        grantor: string;
        grantee: string;
        privilege_type: string;
        is_grantable: "YES" | "NO";
      }>(
        tableGrantsQuery,
        roles && roles.length > 0 ? [schema, roles] : [schema]
      );

      // 3) RLS policies
      const policiesRes = await client.query<{
        schemaname: string;
        tablename: string;
        policyname: string;
        permissive: "PERMISSIVE" | "RESTRICTIVE";
        roles: string[] | null;
        cmd: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";
        qual: string | null; // USING
        with_check: string | null; // WITH CHECK
      }>(
        `
        select
          schemaname,
          tablename,
          policyname,
          permissive,
          roles,
          cmd,
          qual,
          with_check
        from pg_policies
        where schemaname = $1
        order by tablename, policyname;
        `,
        [schema]
      );

      // 4) Default privileges that target tables in this schema
      //    (who will get what privileges on future tables created in this schema)
      const defaultPrivsRes = await client.query<{
        defaclrole: string; // role that owns the default ACL
        defaclobjtype: string; // 'r' for tables
        defaclnsp: string; // schema name
        grantor: string;
        grantee: string;
        privilege_type: string;
        is_grantable: "YES" | "NO";
      }>(
        `
        with defaults as (
          select
            r1.rolname as defaclrole,
            n.nspname as defaclnsp,
            d.defaclobjtype,
            d.defaclacl
          from pg_default_acl d
          join pg_roles r1 on r1.oid = d.defaclrole
          left join pg_namespace n on n.oid = d.defaclnamespace
          where d.defaclobjtype = 'r' -- tables
            and n.nspname = $1
        ),
        exploded as (
          select
            defaclrole,
            defaclnsp,
            defaclobjtype,
            (aclexplode(defaclacl)).*
          from defaults
        ),
        mapped as (
          select
            defaclrole,
            defaclnsp,
            defaclobjtype,
            (select rolname from pg_roles where oid = grantor) as grantor,
            case
              when grantee = 0 then 'PUBLIC'
              else (select rolname from pg_roles where oid = grantee)
            end as grantee,
            privilege_type,
            is_grantable
          from exploded
        )
        select * from mapped
        order by grantee, privilege_type;
        `,
        [schema]
      );

      // 5) Column-level privileges
      const columnGrantsQuery = `
        select
          table_schema,
          table_name,
          column_name,
          grantor,
          grantee,
          privilege_type,
          is_grantable
        from information_schema.column_privileges
        where table_schema = $1
          and privilege_type IN ('INSERT', 'UPDATE')
          ${roles && roles.length > 0 ? `and grantee = ANY($2)` : ""}
        order by table_name, column_name, grantee, privilege_type;
      `;

      const columnGrantsRes = await client.query<{
        table_schema: string;
        table_name: string;
        column_name: string;
        grantor: string;
        grantee: string;
        privilege_type: string;
        is_grantable: "YES" | "NO";
      }>(
        columnGrantsQuery,
        roles && roles.length > 0 ? [schema, roles] : [schema]
      );

      // 6) Table triggers
      const triggersRes = await client.query<{
        trigger_schema: string;
        trigger_name: string;
        event_object_table: string;
        action_timing: string;
        event_manipulation: string;
        action_orientation: string;
        action_statement: string;
        action_condition: string | null;
        action_order: number;
      }>(
        `
        select
          trigger_schema,
          trigger_name,
          event_object_table,
          action_timing,
          event_manipulation,
          action_orientation,
          action_statement,
          action_condition,
          action_order
        from information_schema.triggers
        where trigger_schema = $1
        order by event_object_table, action_order, trigger_name;
        `,
        [schema]
      );

      // 7) Column information for schema documentation
      const columnsRes = await client.query<{
        table_schema: string;
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
        character_maximum_length: number | null;
        numeric_precision: number | null;
        numeric_scale: number | null;
        ordinal_position: number;
      }>(
        `
        select
          table_schema,
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          ordinal_position
        from information_schema.columns
        where table_schema = $1
        order by table_name, ordinal_position;
        `,
        [schema]
      );

      // 8) Foreign key constraints
      const foreignKeysRes = await client.query<{
        table_schema: string;
        table_name: string;
        constraint_name: string;
        column_name: string;
        foreign_table_schema: string;
        foreign_table_name: string;
        foreign_column_name: string;
        update_rule: string;
        delete_rule: string;
      }>(
        `
        select
          tc.table_schema,
          tc.table_name,
          tc.constraint_name,
          kcu.column_name,
          ccu.table_schema as foreign_table_schema,
          ccu.table_name as foreign_table_name,
          ccu.column_name as foreign_column_name,
          rc.update_rule,
          rc.delete_rule
        from information_schema.table_constraints as tc
        join information_schema.key_column_usage as kcu
          on tc.constraint_name = kcu.constraint_name
          and tc.table_schema = kcu.table_schema
        join information_schema.constraint_column_usage as ccu
          on ccu.constraint_name = tc.constraint_name
          and ccu.table_schema = tc.table_schema
        join information_schema.referential_constraints as rc
          on tc.constraint_name = rc.constraint_name
          and tc.table_schema = rc.constraint_schema
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_schema = $1
        order by tc.table_name, tc.constraint_name, kcu.ordinal_position;
        `,
        [schema]
      );

      // 9) Check constraints and unique constraints
      const constraintsRes = await client.query<{
        table_schema: string;
        table_name: string;
        constraint_name: string;
        constraint_type: string;
        column_name: string | null;
        check_clause: string | null;
      }>(
        `
        select
          tc.table_schema,
          tc.table_name,
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          cc.check_clause
        from information_schema.table_constraints as tc
        left join information_schema.key_column_usage as kcu
          on tc.constraint_name = kcu.constraint_name
          and tc.table_schema = kcu.table_schema
        left join information_schema.check_constraints as cc
          on tc.constraint_name = cc.constraint_name
          and tc.constraint_schema = cc.constraint_schema
        where tc.constraint_type IN ('CHECK', 'UNIQUE', 'PRIMARY KEY')
          and tc.table_schema = $1
        order by tc.table_name, tc.constraint_name, kcu.ordinal_position;
        `,
        [schema]
      );

      // 10) Table and column comments
      const commentsRes = await client.query<{
        table_schema: string;
        table_name: string;
        column_name: string | null;
        comment: string;
        comment_type: string;
      }>(
        `
        select
          n.nspname as table_schema,
          c.relname as table_name,
          null as column_name,
          obj_description(c.oid) as comment,
          'TABLE' as comment_type
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r'
          and n.nspname = $1
          and obj_description(c.oid) is not null
        
        UNION ALL
        
        select
          n.nspname as table_schema,
          c.relname as table_name,
          a.attname as column_name,
          col_description(c.oid, a.attnum) as comment,
          'COLUMN' as comment_type
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
        where c.relkind = 'r'
          and n.nspname = $1
          and a.attnum > 0
          and not a.attisdropped
          and col_description(c.oid, a.attnum) is not null
        order by table_name, comment_type, column_name;
        `,
        [schema]
      );

      // Build an index of grants by table
      const grantsByTable = new Map<
        string,
        Array<{
          grantor: string;
          grantee: string;
          privilege: string;
          is_grantable: boolean;
        }>
      >();

      for (const g of grantsRes.rows) {
        const key = `${g.table_schema}.${g.table_name}`;
        if (!grantsByTable.has(key)) grantsByTable.set(key, []);
        grantsByTable.get(key)!.push({
          grantor: g.grantor,
          grantee: g.grantee,
          privilege: g.privilege_type,
          is_grantable: g.is_grantable === "YES",
        });
      }

      // Build an index of column grants by table
      const columnGrantsByTable = new Map<
        string,
        Array<{
          column_name: string;
          grantor: string;
          grantee: string;
          privilege: string;
          is_grantable: boolean;
        }>
      >();

      for (const g of columnGrantsRes.rows) {
        const key = `${g.table_schema}.${g.table_name}`;
        if (!columnGrantsByTable.has(key)) columnGrantsByTable.set(key, []);
        columnGrantsByTable.get(key)!.push({
          column_name: g.column_name,
          grantor: g.grantor,
          grantee: g.grantee,
          privilege: g.privilege_type,
          is_grantable: g.is_grantable === "YES",
        });
      }

      // Build an index of triggers by table
      const triggersByTable = new Map<
        string,
        Array<{
          trigger_name: string;
          action_timing: string;
          event_manipulation: string;
          action_orientation: string;
          action_statement: string;
          action_condition: string | null;
          action_order: number;
        }>
      >();

      for (const t of triggersRes.rows) {
        const key = `${t.trigger_schema}.${t.event_object_table}`;
        if (!triggersByTable.has(key)) triggersByTable.set(key, []);
        triggersByTable.get(key)!.push({
          trigger_name: t.trigger_name,
          action_timing: t.action_timing,
          event_manipulation: t.event_manipulation,
          action_orientation: t.action_orientation,
          action_statement: t.action_statement,
          action_condition: t.action_condition,
          action_order: t.action_order,
        });
      }

      // Build an index of policies by table
      const policiesByTable = new Map<
        string,
        Array<{
          policy: string;
          cmd: string;
          roles: string[] | null;
          permissive: string;
          using?: string | null;
          with_check?: string | null;
        }>
      >();
      for (const p of policiesRes.rows) {
        const key = `${p.schemaname}.${p.tablename}`;
        if (!policiesByTable.has(key)) policiesByTable.set(key, []);
        policiesByTable.get(key)!.push({
          policy: p.policyname,
          cmd: p.cmd,
          roles: p.roles || [],
          permissive: p.permissive,
          using: p.qual,
          with_check: p.with_check,
        });
      }

      // Build an index of columns by table
      const columnsByTable = new Map<
        string,
        Array<{
          column_name: string;
          data_type: string;
          is_nullable: string;
          column_default: string | null;
          character_maximum_length: number | null;
          numeric_precision: number | null;
          numeric_scale: number | null;
        }>
      >();

      for (const c of columnsRes.rows) {
        const key = `${c.table_schema}.${c.table_name}`;
        if (!columnsByTable.has(key)) columnsByTable.set(key, []);
        columnsByTable.get(key)!.push({
          column_name: c.column_name,
          data_type: c.data_type,
          is_nullable: c.is_nullable,
          column_default: c.column_default,
          character_maximum_length: c.character_maximum_length,
          numeric_precision: c.numeric_precision,
          numeric_scale: c.numeric_scale,
        });
      }

      // Build an index of foreign keys by table
      const foreignKeysByTable = new Map<
        string,
        Array<{
          constraint_name: string;
          column_name: string;
          foreign_table_schema: string;
          foreign_table_name: string;
          foreign_column_name: string;
          update_rule: string;
          delete_rule: string;
        }>
      >();

      for (const fk of foreignKeysRes.rows) {
        const key = `${fk.table_schema}.${fk.table_name}`;
        if (!foreignKeysByTable.has(key)) foreignKeysByTable.set(key, []);
        foreignKeysByTable.get(key)!.push({
          constraint_name: fk.constraint_name,
          column_name: fk.column_name,
          foreign_table_schema: fk.foreign_table_schema,
          foreign_table_name: fk.foreign_table_name,
          foreign_column_name: fk.foreign_column_name,
          update_rule: fk.update_rule,
          delete_rule: fk.delete_rule,
        });
      }

      // Build an index of constraints by table
      const constraintsByTable = new Map<
        string,
        Array<{
          constraint_name: string;
          constraint_type: string;
          column_name: string | null;
          check_clause: string | null;
        }>
      >();

      for (const c of constraintsRes.rows) {
        const key = `${c.table_schema}.${c.table_name}`;
        if (!constraintsByTable.has(key)) constraintsByTable.set(key, []);
        constraintsByTable.get(key)!.push({
          constraint_name: c.constraint_name,
          constraint_type: c.constraint_type,
          column_name: c.column_name,
          check_clause: c.check_clause,
        });
      }

      // Build an index of comments by table
      const commentsByTable = new Map<
        string,
        Array<{
          column_name: string | null;
          comment: string;
          comment_type: string;
        }>
      >();

      for (const c of commentsRes.rows) {
        const key = `${c.table_schema}.${c.table_name}`;
        if (!commentsByTable.has(key)) commentsByTable.set(key, []);
        commentsByTable.get(key)!.push({
          column_name: c.column_name,
          comment: c.comment,
          comment_type: c.comment_type,
        });
      }

      // Shape the final result
      const data = {
        schema,
        generated_at_utc: new Date().toISOString(),
        tables: tablesRes.rows.map((t) => {
          const key = `${t.schema}.${t.table_name}`;
          return {
            table: t.table_name,
            owner: t.owner,
            rls: {
              enabled: t.relrowsecurity,
              force: t.relforcerowsecurity,
              policies: policiesByTable.get(key) ?? [],
            },
            rbac: {
              table_grants: (grantsByTable.get(key) ?? []).sort(
                (a, b) =>
                  a.grantee.localeCompare(b.grantee) ||
                  a.privilege.localeCompare(b.privilege)
              ),
              column_grants: (columnGrantsByTable.get(key) ?? []).sort(
                (a, b) =>
                  a.column_name.localeCompare(b.column_name) ||
                  a.grantee.localeCompare(b.grantee) ||
                  a.privilege.localeCompare(b.privilege)
              ),
            },
            triggers: (triggersByTable.get(key) ?? []).sort(
              (a, b) =>
                a.action_order - b.action_order ||
                a.trigger_name.localeCompare(b.trigger_name)
            ),
            columns: (columnsByTable.get(key) ?? []).sort((a, b) =>
              a.column_name.localeCompare(b.column_name)
            ),
            foreign_keys: (foreignKeysByTable.get(key) ?? []).sort((a, b) =>
              a.constraint_name.localeCompare(b.constraint_name)
            ),
            constraints: (constraintsByTable.get(key) ?? []).sort((a, b) =>
              a.constraint_name.localeCompare(b.constraint_name)
            ),
            comments: (commentsByTable.get(key) ?? []).sort((a, b) =>
              (a.column_name || "").localeCompare(b.column_name || "")
            ),
          };
        }),
        default_table_privileges: defaultPrivsRes.rows.map((row) => ({
          schema: row.defaclnsp,
          owner_of_default_acl: row.defaclrole,
          grantor: row.grantor,
          grantee: row.grantee,
          privilege: row.privilege_type,
          is_grantable: row.is_grantable === "YES",
        })),
      };

      // Generate one SQL file per table in schema-specific directory
      let schemaFilesCreated = 0;
      for (const table of data.tables) {
        const sqlContent = generateTableSQL(schema, table, roles);
        const filename = `${table.table}.sql`;
        const filepath = path.join(schemaOutputDir, filename);

        fs.writeFileSync(filepath, sqlContent, "utf8");
        schemaFilesCreated++;
      }

      // Also create a summary file with default privileges if any
      if (data.default_table_privileges.length > 0) {
        const summaryLines: string[] = [];
        summaryLines.push(`-- Default table privileges for schema ${schema}`);
        summaryLines.push(`-- Generated at: ${data.generated_at_utc}`);
        summaryLines.push("");

        for (const dp of data.default_table_privileges) {
          summaryLines.push(
            `-- Default ACL: ${dp.owner_of_default_acl} grants ${
              dp.privilege
            } to ${dp.grantee}${dp.is_grantable ? " (with grant option)" : ""}`
          );
          summaryLines.push(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT ${
              dp.privilege
            } ON TABLES TO ${dp.grantee}${
              dp.is_grantable ? " WITH GRANT OPTION" : ""
            };`
          );
        }

        const summaryPath = path.join(
          schemaOutputDir,
          "_default_privileges.sql"
        );
        fs.writeFileSync(summaryPath, summaryLines.join("\n"), "utf8");
        schemaFilesCreated++;
      }

      console.log(
        `  Created ${schemaFilesCreated} SQL files in: ${schemaOutputDir}`
      );
      totalFiles += schemaFilesCreated;
    }

    console.log(
      `\nTotal: ${totalFiles} SQL files created across ${schemas.length} schema(s) in: ${baseOutputDir}`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
