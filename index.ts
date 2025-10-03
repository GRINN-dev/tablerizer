#!/usr/bin/env ts-node

/**
 * Dump RBAC (table privileges) and RLS (policies) for all tables in a schema.
 *
 * Usage:
 *   ts-node dump-rbac-rls.ts --schema public --out rbac_rls.json --format json
 *   DATABASE_URL=postgres://user:pass@host:5432/db ts-node dump-rbac-rls.ts --schema my_schema
 *
 * Options:
 *   --schema   Target schema name (required)
 *   --out      Output file path (default: ./rbac_rls_<schema>.json or .md)
 *   --format   "json" (default) or "md"
 */

import fs from "fs";
import path from "path";
import { Client } from "pg";

type Args = {
  schema: string;
  out?: string;
  format?: "json" | "md";
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { schema: "", format: "json" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === "--schema") {
      out.schema = next;
      i++;
      continue;
    }
    if (a === "--out") {
      out.out = next;
      i++;
      continue;
    }
    if (a === "--format") {
      out.format = (next as Args["format"]) || "json";
      i++;
      continue;
    }
  }
  if (!out.schema) {
    console.error("ERROR: --schema is required");
    process.exit(1);
  }
  return out;
}

async function main() {
  const { schema, out, format } = parseArgs();

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
    const grantsRes = await client.query<{
      table_schema: string;
      table_name: string;
      grantor: string;
      grantee: string;
      privilege_type: string;
      is_grantable: "YES" | "NO";
    }>(
      `
      select
        table_schema,
        table_name,
        grantor,
        grantee,
        privilege_type,
        is_grantable
      from information_schema.role_table_grants
      where table_schema = $1
      order by table_name, grantee, privilege_type;
      `,
      [schema]
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

    // Build an index of policies by table
    const policiesByTable = new Map<
      string,
      Array<{
        policy: string;
        cmd: string;
        roles: string[];
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
        roles: p.roles ?? ["PUBLIC"],
        permissive: p.permissive,
        using: p.qual,
        with_check: p.with_check,
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
          },
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

    // Output
    const outPath = (() => {
      if (out) return out;
      const ext = format === "md" ? "md" : "json";
      return path.resolve(process.cwd(), `rbac_rls_${schema}.${ext}`);
    })();

    if (format === "md") {
      const mdParts: string[] = [];
      mdParts.push(`# RBAC & RLS for schema \`${schema}\``);
      mdParts.push(`_Generated at: ${data.generated_at_utc}_\n`);

      for (const t of data.tables) {
        mdParts.push(`## ${schema}.${t.table} (owner: \`${t.owner}\`)`);
        mdParts.push(
          `- RLS enabled: \`${t.rls.enabled}\`, force: \`${t.rls.force}\``
        );
        if (t.rls.policies.length === 0) {
          mdParts.push(`- Policies: _none_`);
        } else {
          mdParts.push(`### Policies`);
          for (const p of t.rls.policies) {
            mdParts.push(
              `- **${p.policy}** (${p.cmd}, ${
                p.permissive
              }); roles: \`${p.roles.join(", ")}\`` +
                (p.using ? `\n  - USING: \`${p.using}\`` : "") +
                (p.with_check ? `\n  - WITH CHECK: \`${p.with_check}\`` : "")
            );
          }
        }
        mdParts.push(`### Table Grants`);
        if (t.rbac.table_grants.length === 0) {
          mdParts.push(`_none_\n`);
        } else {
          mdParts.push(`| Grantee | Privilege | Grantable | Grantor |`);
          mdParts.push(`|---|---|---|---|`);
          for (const g of t.rbac.table_grants) {
            mdParts.push(
              `| \`${g.grantee}\` | \`${g.privilege}\` | \`${g.is_grantable}\` | \`${g.grantor}\` |`
            );
          }
          mdParts.push("");
        }
      }

      mdParts.push(`## Default table privileges for \`${schema}\``);
      if (data.default_table_privileges.length === 0) {
        mdParts.push(`_none_`);
      } else {
        mdParts.push(
          `| Default ACL Owner | Grantee | Privilege | Grantable | Grantor |`
        );
        mdParts.push(`|---|---|---|---|---|`);
        for (const d of data.default_table_privileges) {
          mdParts.push(
            `| \`${d.owner_of_default_acl}\` | \`${d.grantee}\` | \`${d.privilege}\` | \`${d.is_grantable}\` | \`${d.grantor}\` |`
          );
        }
      }

      fs.writeFileSync(outPath, mdParts.join("\n"), "utf8");
    } else {
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");
    }

    console.log(`Wrote ${format?.toUpperCase()} to: ${outPath}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
