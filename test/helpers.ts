/**
 * Shared test helpers for Tablerizer test suite
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { TestDatabase } from "./test-database.js";
import { Tablerizer } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const OUTPUT_DIR = path.join(__dirname, "..", "test-output");

export let db: TestDatabase;

/** Read a generated SQL file from the test output directory */
export async function readOutput(
  schema: string,
  type: string,
  name: string,
): Promise<string> {
  return fs.readFile(path.join(OUTPUT_DIR, schema, type, `${name}.sql`), "utf-8");
}

/** Create a fresh Tablerizer wired to the test DB */
export function freshTablerizer(overrides: Record<string, unknown> = {}): Tablerizer {
  return new Tablerizer({
    schemas: ["app_public", "app_private"],
    out: OUTPUT_DIR,
    database_url: db.databaseUrl,
    roles: [db.visitorRole, db.authenticatorRole],
    role_mappings: {
      [db.visitorRole]: ":DATABASE_VISITOR",
      [db.authenticatorRole]: ":DATABASE_AUTHENTICATOR",
    },
    ...overrides,
  });
}

/** Global setup — call once from the entry-point test file */
export async function globalSetup(): Promise<void> {
  db = new TestDatabase();
  await db.setup();
  const fixturesPath = path.join(__dirname, "fixtures", "test-schema.sql");
  const sql = await fs.readFile(fixturesPath, "utf-8");
  await db.executeSQL(sql);
}

/** Global teardown */
export async function globalTeardown(): Promise<void> {
  await db?.teardown();
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true }).catch(() => {});
}

/** Clean output dir (call in beforeEach) */
export async function cleanOutput(): Promise<void> {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true }).catch(() => {});
}
