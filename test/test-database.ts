/**
 * Test Database Initialization Script
 * Adapted from init-db.ts for testing infrastructure
 */

import pkg, { Pool, Client } from "pg";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface TestDatabaseConfig {
  DATABASE_AUTHENTICATOR: string;
  DATABASE_AUTHENTICATOR_PASSWORD: string;
  DATABASE_NAME: string;
  DATABASE_OWNER: string;
  DATABASE_OWNER_PASSWORD: string;
  DATABASE_VISITOR: string;
  ROOT_DATABASE_URL: string;
}

export class TestDatabase {
  private config: TestDatabaseConfig;
  private pool?: Pool;

  constructor(config: TestDatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize test database with roles and clean setup
   */
  async initialize(): Promise<void> {
    const pgPool = new Pool({
      connectionString: this.config.ROOT_DATABASE_URL,
    });

    pgPool.on("error", (err) => {
      console.log(
        "An error occurred while trying to talk to the database: " + err.message
      );
    });

    // Wait for database to be ready
    let attempts = 0;
    while (true) {
      try {
        await pgPool.query('select true as "Connection test";');
        break;
      } catch (e: any) {
        if (e.code === "28P01") {
          throw e;
        }
        attempts++;
        if (attempts <= 30) {
          console.log(
            `The database is not ready yet (attempt ${attempts}): ${e.message}`
          );
        } else {
          console.log(`The database never came up, aborting :(`);
          throw new Error("Database connection timeout");
        }
        await sleep(1000);
      }
    }

    const client = await pgPool.connect();

    try {
      // Clean up existing resources
      await this.cleanup(client);
      
      // Create roles and database
      await this.createRoles(client);
      await this.createDatabase(client);
      
      console.log(`✅ Test database ${this.config.DATABASE_NAME} initialized successfully`);
    } finally {
      await client.release();
      await pgPool.end();
    }
  }

  /**
   * Clean up existing databases and roles
   */
  private async cleanup(client: any): Promise<void> {
    try {
      // Terminate connections to databases we're about to drop
      await client.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname IN ('${this.config.DATABASE_NAME}', '${this.config.DATABASE_NAME}_test')
          AND pid <> pg_backend_pid();
      `);

      await client.query(`DROP DATABASE IF EXISTS ${this.config.DATABASE_NAME};`);
      await client.query(`DROP DATABASE IF EXISTS ${this.config.DATABASE_NAME}_test;`);
      await client.query(`DROP ROLE IF EXISTS ${this.config.DATABASE_VISITOR};`);
      await client.query(`DROP ROLE IF EXISTS ${this.config.DATABASE_AUTHENTICATOR};`);
      await client.query(`DROP ROLE IF EXISTS ${this.config.DATABASE_OWNER};`);
      
      console.log(`🧹 Cleaned up existing databases and roles`);
    } catch (error: any) {
      // Non-fatal - resources might not exist
      console.log(`ℹ️  Cleanup warnings (non-fatal): ${error.message}`);
    }
  }

  /**
   * Create database roles
   */
  private async createRoles(client: any): Promise<void> {
    await client.query(
      `CREATE ROLE ${this.config.DATABASE_OWNER} WITH LOGIN PASSWORD '${this.config.DATABASE_OWNER_PASSWORD}' SUPERUSER;`
    );
    await client.query(
      `CREATE ROLE ${this.config.DATABASE_AUTHENTICATOR} WITH LOGIN PASSWORD '${this.config.DATABASE_AUTHENTICATOR_PASSWORD}' NOINHERIT;`
    );
    await client.query(`CREATE ROLE ${this.config.DATABASE_VISITOR};`);
    await client.query(
      `GRANT ${this.config.DATABASE_VISITOR} TO ${this.config.DATABASE_AUTHENTICATOR};`
    );
    
    console.log(`👥 Created roles: ${this.config.DATABASE_OWNER}, ${this.config.DATABASE_AUTHENTICATOR}, ${this.config.DATABASE_VISITOR}`);
  }

  /**
   * Create test database
   */
  private async createDatabase(client: any): Promise<void> {
    await client.query(`CREATE DATABASE ${this.config.DATABASE_NAME} OWNER ${this.config.DATABASE_OWNER};`);
    console.log(`🗄️  Created database: ${this.config.DATABASE_NAME}`);
  }

  /**
   * Connect to the test database and return a client pool
   */
  async connect(): Promise<Pool> {
    if (!this.pool) {
      const databaseUrl = this.config.ROOT_DATABASE_URL.replace('/postgres', `/${this.config.DATABASE_NAME}`);
      this.pool = new Pool({ connectionString: databaseUrl });
    }
    return this.pool;
  }

  /**
   * Execute SQL scripts on the test database
   */
  async executeSQL(sql: string): Promise<any> {
    const pool = await this.connect();
    const client = await pool.connect();
    
    try {
      const result = await client.query(sql);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Execute SQL file on the test database
   */
  async executeSQLFile(filePath: string): Promise<void> {
    const fs = await import('fs/promises');
    const sql = await fs.readFile(filePath, 'utf-8');
    await this.executeSQL(sql);
    console.log(`📄 Executed SQL file: ${filePath}`);
  }

  /**
   * Destroy test database and clean up
   */
  async destroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }

    const pgPool = new Pool({
      connectionString: this.config.ROOT_DATABASE_URL,
    });

    const client = await pgPool.connect();
    try {
      await this.cleanup(client);
      console.log(`💥 Destroyed test database ${this.config.DATABASE_NAME}`);
    } finally {
      await client.release();
      await pgPool.end();
    }
  }
}

/**
 * Create test database instance from environment variables
 */
export function createTestDatabase(): TestDatabase {
  const config: TestDatabaseConfig = {
    DATABASE_AUTHENTICATOR: process.env.DATABASE_AUTHENTICATOR || "tablerizer_authenticator",
    DATABASE_AUTHENTICATOR_PASSWORD: process.env.DATABASE_AUTHENTICATOR_PASSWORD || "123",
    DATABASE_NAME: process.env.DATABASE_NAME || "tablerizer_test",
    DATABASE_OWNER: process.env.DATABASE_OWNER || "tablerizer_owner", 
    DATABASE_OWNER_PASSWORD: process.env.DATABASE_OWNER_PASSWORD || "123",
    DATABASE_VISITOR: process.env.DATABASE_VISITOR || "tablerizer_visitor",
    ROOT_DATABASE_URL: process.env.ROOT_DATABASE_URL || "postgresql://louislec@localhost:5432/postgres"
  };

  // Validate required environment variables
  const missing = Object.entries(config).filter(([key, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return new TestDatabase(config);
}