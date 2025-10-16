#!/usr/bin/env ts-node

/**
 * Export PostgreSQL functions to individual SQL files with CREATE OR REPLACE for idempotency.
 *
 * Usage:
 *   ts-node export-functions.ts --schemas "schema1,schema2" --out ./functions_export
 *   ts-node export-functions.ts --schemas "public,priv" --roles "role1,role2"
 *   DATABASE_URL=postgres://user:pass@host:5432/db ts-node export-functions.ts --schemas "public,priv"
 *
 * Options:
 *   --schemas  Target schema names, comma-separated (required)
 *   --out      Output directory (default: ./functions_export/)
 *   --roles    Roles to grant EXECUTE permission, comma-separated (optional)
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
    if (a === "--roles") {
      out.roles = next.split(",").map((r) => r.trim());
      i++;
      continue;
    }
  }
  if (out.schemas.length === 0) {
    console.error("ERROR: --schemas is required");
    process.exit(1);
  }
  return out;
}

/**
 * Generate a complete SQL file content for a function
 */
function generateFunctionSQL(
  func: {
    schema_name: string;
    function_name: string;
    function_definition: string;
    function_arguments: string;
    return_type: string;
    function_type: string;
    language: string;
    is_security_definer: boolean;
    comment: string | null;
  },
  roles?: string[]
): string {
  const lines: string[] = [];

  lines.push(`-- Function: ${func.schema_name}.${func.function_name}`);
  lines.push(`-- Generated at: ${new Date().toISOString()}`);
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
    console.log(`Exporting functions from schemas: ${schemas.join(", ")}`);
    if (roles && roles.length > 0) {
      console.log(`Adding EXECUTE grants for roles: ${roles.join(", ")}`);
    }

    // Query to get all functions from specified schemas
    const functionsRes = await client.query<{
      schema_name: string;
      function_name: string;
      function_definition: string;
      function_arguments: string;
      return_type: string;
      function_type: string;
      language: string;
      is_security_definer: boolean;
      comment: string | null;
    }>(
      `
      select
        n.nspname as schema_name,
        p.proname as function_name,
        pg_get_functiondef(p.oid) as function_definition,
        pg_get_function_arguments(p.oid) as function_arguments,
        pg_get_function_result(p.oid) as return_type,
        case 
          when p.prokind = 'f' then 'FUNCTION'
          when p.prokind = 'p' then 'PROCEDURE'
          when p.prokind = 'a' then 'AGGREGATE'
          when p.prokind = 'w' then 'WINDOW'
          else 'UNKNOWN'
        end as function_type,
        l.lanname as language,
        p.prosecdef as is_security_definer,
        obj_description(p.oid, 'pg_proc') as comment
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
      where n.nspname = ANY($1)
        and p.prokind in ('f', 'p')  -- functions and procedures only (excludes aggregates)
      order by n.nspname, p.proname;
      `,
      [schemas]
    );

    if (functionsRes.rows.length === 0) {
      console.log("No functions found in the specified schemas.");
      return;
    }

    // Create output directory structure
    const outputDir = out || path.resolve(process.cwd(), "functions_export");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create schema directories and function files
    let filesCreated = 0;
    const schemaStats = new Map<string, number>();

    for (const func of functionsRes.rows) {
      // Create schema directory if it doesn't exist
      const schemaDir = path.join(outputDir, func.schema_name);
      if (!fs.existsSync(schemaDir)) {
        fs.mkdirSync(schemaDir, { recursive: true });
      }

      // Generate function SQL content
      const sqlContent = generateFunctionSQL(func, roles);

      // Create filename - handle function overloading by including a simple identifier
      const baseFilename = func.function_name;
      const filename = `${baseFilename}.sql`;
      const filepath = path.join(schemaDir, filename);

      // If file exists, we need to handle overloaded functions
      let finalFilepath = filepath;
      let counter = 1;
      while (fs.existsSync(finalFilepath)) {
        const nameWithCounter = `${baseFilename}_${counter}.sql`;
        finalFilepath = path.join(schemaDir, nameWithCounter);
        counter++;
      }

      fs.writeFileSync(finalFilepath, sqlContent, "utf8");
      filesCreated++;

      // Update schema stats
      const currentCount = schemaStats.get(func.schema_name) || 0;
      schemaStats.set(func.schema_name, currentCount + 1);
    }

    // Create a summary file
    const summaryLines: string[] = [];
    summaryLines.push(`-- Function Export Summary`);
    summaryLines.push(`-- Generated at: ${new Date().toISOString()}`);
    summaryLines.push(`-- Schemas: ${schemas.join(", ")}`);
    if (roles && roles.length > 0) {
      summaryLines.push(`-- Roles with EXECUTE grants: ${roles.join(", ")}`);
    }
    summaryLines.push("");

    for (const [schema, count] of schemaStats) {
      summaryLines.push(`-- ${schema}: ${count} functions`);
    }
    summaryLines.push("");
    summaryLines.push(`-- Total: ${filesCreated} function files created`);

    const summaryPath = path.join(outputDir, "_export_summary.txt");
    fs.writeFileSync(summaryPath, summaryLines.join("\n"), "utf8");

    console.log(`\nExport completed successfully!`);
    console.log(`Created ${filesCreated} function files in: ${outputDir}`);

    for (const [schema, count] of schemaStats) {
      console.log(`  ${schema}/: ${count} functions`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
