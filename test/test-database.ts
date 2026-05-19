/**
 * Test Database Setup/Teardown for Tablerizer
 *
 * Creates an isolated PostgreSQL database with test roles,
 * loads the fixture schema, and tears everything down after tests.
 *
 * Works with:
 *   - Docker (docker-compose.test.yml)
 *   - GitHub Actions (PostgreSQL service container)
 *   - Local PostgreSQL (if ROOT_DATABASE_URL is set)
 */

import { SQL } from "bun";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface TestDatabaseConfig {
  ROOT_DATABASE_URL: string;
  DATABASE_NAME: string;
  DATABASE_OWNER: string;
  DATABASE_OWNER_PASSWORD: string;
  DATABASE_AUTHENTICATOR: string;
  DATABASE_AUTHENTICATOR_PASSWORD: string;
  DATABASE_VISITOR: string;
}

function getConfig(): TestDatabaseConfig {
  return {
    ROOT_DATABASE_URL:
      process.env.ROOT_DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5433/postgres",
    DATABASE_NAME: process.env.DATABASE_NAME || "tablerizer_test",
    DATABASE_OWNER: process.env.DATABASE_OWNER || "tablerizer_owner",
    DATABASE_OWNER_PASSWORD:
      process.env.DATABASE_OWNER_PASSWORD || "test_owner_pass",
    DATABASE_AUTHENTICATOR:
      process.env.DATABASE_AUTHENTICATOR || "tablerizer_authenticator",
    DATABASE_AUTHENTICATOR_PASSWORD:
      process.env.DATABASE_AUTHENTICATOR_PASSWORD || "test_auth_pass",
    DATABASE_VISITOR: process.env.DATABASE_VISITOR || "tablerizer_visitor",
  };
}

export class TestDatabase {
  private config: TestDatabaseConfig;
  private sql?: InstanceType<typeof SQL>;

  constructor(config?: TestDatabaseConfig) {
    this.config = config || getConfig();
  }

  get databaseUrl(): string {
    const url = new URL(this.config.ROOT_DATABASE_URL);
    url.pathname = `/${this.config.DATABASE_NAME}`;
    url.username = this.config.DATABASE_OWNER;
    url.password = this.config.DATABASE_OWNER_PASSWORD;
    return url.toString();
  }

  get ownerRole(): string {
    return this.config.DATABASE_OWNER;
  }

  get visitorRole(): string {
    return this.config.DATABASE_VISITOR;
  }

  get authenticatorRole(): string {
    return this.config.DATABASE_AUTHENTICATOR;
  }

  async setup(): Promise<void> {
    const rootSql = new SQL(this.config.ROOT_DATABASE_URL);

    // Wait for PG to be ready (up to 30 s)
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      try {
        await rootSql.unsafe("SELECT 1");
        ready = true;
      } catch {
        await sleep(1000);
      }
    }
    if (!ready) {
      await rootSql.close();
      throw new Error("PostgreSQL not reachable after 30 s");
    }

    try {
      // Terminate existing connections
      await rootSql.unsafe(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [this.config.DATABASE_NAME],
      ).catch(() => {});

      // Idempotent cleanup
      await rootSql.unsafe(`DROP DATABASE IF EXISTS ${this.config.DATABASE_NAME}`).catch(() => {});
      await rootSql.unsafe(`DROP ROLE IF EXISTS ${this.config.DATABASE_VISITOR}`).catch(() => {});
      await rootSql.unsafe(`DROP ROLE IF EXISTS ${this.config.DATABASE_AUTHENTICATOR}`).catch(() => {});
      await rootSql.unsafe(`DROP ROLE IF EXISTS ${this.config.DATABASE_OWNER}`).catch(() => {});

      // Create roles
      await rootSql.unsafe(
        `CREATE ROLE ${this.config.DATABASE_OWNER} WITH LOGIN PASSWORD '${this.config.DATABASE_OWNER_PASSWORD}' SUPERUSER`,
      );
      await rootSql.unsafe(
        `CREATE ROLE ${this.config.DATABASE_AUTHENTICATOR} WITH LOGIN PASSWORD '${this.config.DATABASE_AUTHENTICATOR_PASSWORD}' NOINHERIT`,
      );
      await rootSql.unsafe(`CREATE ROLE ${this.config.DATABASE_VISITOR}`);
      await rootSql.unsafe(
        `GRANT ${this.config.DATABASE_VISITOR} TO ${this.config.DATABASE_AUTHENTICATOR}`,
      );

      // Create database
      await rootSql.unsafe(
        `CREATE DATABASE ${this.config.DATABASE_NAME} OWNER ${this.config.DATABASE_OWNER}`,
      );
    } finally {
      await rootSql.close();
    }
  }

  async executeSQL(sqlText: string): Promise<void> {
    if (!this.sql) {
      this.sql = new SQL(this.databaseUrl);
    }
    await this.sql.unsafe(sqlText);
  }

  async teardown(): Promise<void> {
    if (this.sql) {
      await this.sql.close();
      this.sql = undefined;
    }

    const rootSql = new SQL(this.config.ROOT_DATABASE_URL);
    try {
      await rootSql.unsafe(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [this.config.DATABASE_NAME],
      ).catch(() => {});

      await rootSql.unsafe(`DROP DATABASE IF EXISTS ${this.config.DATABASE_NAME}`).catch(() => {});
      await rootSql.unsafe(`DROP ROLE IF EXISTS ${this.config.DATABASE_VISITOR}`).catch(() => {});
      await rootSql.unsafe(`DROP ROLE IF EXISTS ${this.config.DATABASE_AUTHENTICATOR}`).catch(() => {});
      await rootSql.unsafe(`DROP ROLE IF EXISTS ${this.config.DATABASE_OWNER}`).catch(() => {});
    } finally {
      await rootSql.close();
    }
  }
}
