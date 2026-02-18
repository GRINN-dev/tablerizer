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

import pg from "pg";

const { Pool } = pg;

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
  private pool?: InstanceType<typeof Pool>;

  constructor(config?: TestDatabaseConfig) {
    this.config = config || getConfig();
  }

  /** Database URL pointing to the test database, connected as DATABASE_OWNER */
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

  /**
   * Wait for PostgreSQL, then create roles + test database.
   */
  async setup(): Promise<void> {
    const rootPool = new Pool({
      connectionString: this.config.ROOT_DATABASE_URL,
    });

    // Wait for PG to be ready (up to 30 s)
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      try {
        await rootPool.query("SELECT 1");
        ready = true;
      } catch {
        await sleep(1000);
      }
    }
    if (!ready) throw new Error("PostgreSQL not reachable after 30 s");

    const client = await rootPool.connect();
    try {
      // Terminate existing connections
      await client
        .query(
          `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
           WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [this.config.DATABASE_NAME],
        )
        .catch(() => {});

      // Idempotent cleanup
      await client.query(`DROP DATABASE IF EXISTS ${this.config.DATABASE_NAME}`).catch(() => {});
      await client.query(`DROP ROLE IF EXISTS ${this.config.DATABASE_VISITOR}`).catch(() => {});
      await client.query(`DROP ROLE IF EXISTS ${this.config.DATABASE_AUTHENTICATOR}`).catch(() => {});
      await client.query(`DROP ROLE IF EXISTS ${this.config.DATABASE_OWNER}`).catch(() => {});

      // Create roles
      await client.query(
        `CREATE ROLE ${this.config.DATABASE_OWNER} WITH LOGIN PASSWORD '${this.config.DATABASE_OWNER_PASSWORD}' SUPERUSER`,
      );
      await client.query(
        `CREATE ROLE ${this.config.DATABASE_AUTHENTICATOR} WITH LOGIN PASSWORD '${this.config.DATABASE_AUTHENTICATOR_PASSWORD}' NOINHERIT`,
      );
      await client.query(`CREATE ROLE ${this.config.DATABASE_VISITOR}`);
      await client.query(
        `GRANT ${this.config.DATABASE_VISITOR} TO ${this.config.DATABASE_AUTHENTICATOR}`,
      );

      // Create database
      await client.query(
        `CREATE DATABASE ${this.config.DATABASE_NAME} OWNER ${this.config.DATABASE_OWNER}`,
      );
    } finally {
      client.release();
      await rootPool.end();
    }
  }

  /** Execute arbitrary SQL on the test database */
  async executeSQL(sql: string): Promise<void> {
    if (!this.pool) {
      this.pool = new Pool({ connectionString: this.databaseUrl });
    }
    await this.pool.query(sql);
  }

  /** Tear down everything */
  async teardown(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }

    const rootPool = new Pool({
      connectionString: this.config.ROOT_DATABASE_URL,
    });
    const client = await rootPool.connect();
    try {
      await client
        .query(
          `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
           WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [this.config.DATABASE_NAME],
        )
        .catch(() => {});

      await client.query(`DROP DATABASE IF EXISTS ${this.config.DATABASE_NAME}`).catch(() => {});
      await client.query(`DROP ROLE IF EXISTS ${this.config.DATABASE_VISITOR}`).catch(() => {});
      await client.query(`DROP ROLE IF EXISTS ${this.config.DATABASE_AUTHENTICATOR}`).catch(() => {});
      await client.query(`DROP ROLE IF EXISTS ${this.config.DATABASE_OWNER}`).catch(() => {});
    } finally {
      client.release();
      await rootPool.end();
    }
  }
}
