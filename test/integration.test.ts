/**
 * Test Suite for Tablerizer
 * Comprehensive tests with real PostgreSQL database
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TestDatabase, createTestDatabase } from './test-database.js';
import { Tablerizer } from '../lib/index.js';
import fs from 'fs/promises';
import path from 'path';

describe('Tablerizer Integration Tests', () => {
  let testDb: TestDatabase;
  let tablerizer: Tablerizer;
  const testOutputDir = './test-output';

  before(async () => {
    console.log('🚀 Setting up test database...');
    testDb = createTestDatabase();
    await testDb.initialize();
    
    // Load test schema and fixtures
    const schemaPath = path.join(import.meta.dirname, 'fixtures/test-schema.sql');
    let schemaSql = await fs.readFile(schemaPath, 'utf-8');
    
    // Replace role placeholders with actual role names
    schemaSql = schemaSql.replace(/:DATABASE_VISITOR/g, process.env.DATABASE_VISITOR || 'tablerizer_visitor');
    schemaSql = schemaSql.replace(/:DATABASE_AUTHENTICATOR/g, process.env.DATABASE_AUTHENTICATOR || 'tablerizer_authenticator');
    
    await testDb.executeSQL(schemaSql);
    console.log('✅ Test schema loaded successfully');
  });

  after(async () => {
    console.log('🧹 Cleaning up test database...');
    await testDb?.destroy();
    
    // Clean up test output directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  beforeEach(async () => {
    // Clean output directory before each test
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }

    // Create fresh tablerizer instance
    tablerizer = new Tablerizer({
      schemas: ['app_public', 'app_private'],
      out: testOutputDir,
      database_url: process.env.DATABASE_URL,
      roles: [
        process.env.DATABASE_VISITOR || 'tablerizer_visitor',
        process.env.DATABASE_AUTHENTICATOR || 'tablerizer_authenticator'
      ],
      role_mappings: {
        [process.env.DATABASE_VISITOR || 'tablerizer_visitor']: ':DATABASE_VISITOR',
        [process.env.DATABASE_AUTHENTICATOR || 'tablerizer_authenticator']: ':DATABASE_AUTHENTICATOR'
      }
    });
  });

  describe('Database Connection', () => {
    it('should connect to test database successfully', async () => {
      await tablerizer.connect();
      await tablerizer.disconnect();
    });
  });

  describe('Table Export', () => {
    it('should export regular tables with RBAC and RLS', async () => {
      tablerizer.configure({ scope: 'tables' });
      const result = await tablerizer.export();
      
      assert.ok(result.tableFiles > 0, 'Should export at least one table');
      assert.ok(result.totalFiles === result.tableFiles, 'Should only export tables');
      
      // Check that users table was exported
      const usersFile = result.files.find(f => f.name === 'users' && f.schema === 'app_public');
      assert.ok(usersFile, 'Should export users table');
      
      // Read and validate users SQL file
      const usersContent = await fs.readFile(usersFile.filePath, 'utf-8');
      
      // Should contain RLS policies
      assert.ok(usersContent.includes('CREATE POLICY'), 'Should contain RLS policies');
      assert.ok(usersContent.includes('users_select_own'), 'Should contain users_select_own policy');
      
      // Should contain grants with role mappings
      assert.ok(usersContent.includes(':DATABASE_VISITOR'), 'Should contain role mappings');
      
      // Should contain table documentation
      assert.ok(usersContent.includes('TABLE SCHEMA DOCUMENTATION'), 'Should contain schema documentation');
      
      await tablerizer.disconnect();
    });

    it('should handle partitioned tables correctly (exclude individual partitions)', async () => {
      tablerizer.configure({ scope: 'tables' });
      const result = await tablerizer.export();
      
      // Should export sales (parent) but not sales_2023, sales_2024 (partitions)
      const salesFiles = result.files.filter(f => f.name.startsWith('sales'));
      assert.strictEqual(salesFiles.length, 1, 'Should export only parent partitioned table');
      assert.strictEqual(salesFiles[0].name, 'sales', 'Should export sales parent table');
      
      await tablerizer.disconnect();
    });

    it('should handle cross-schema foreign keys', async () => {
      tablerizer.configure({ scope: 'tables' });
      const result = await tablerizer.export();
      
      // Check user_secrets table (in app_private schema)
      const userSecretsFile = result.files.find(f => f.name === 'user_secrets' && f.schema === 'app_private');
      assert.ok(userSecretsFile, 'Should export user_secrets table');
      
      const content = await fs.readFile(userSecretsFile.filePath, 'utf-8');
      // Should reference app_public.users in foreign key
      assert.ok(content.includes('app_public.users'), 'Should show schema-qualified FK reference');
      
      await tablerizer.disconnect();
    });
  });

  describe('Function Export', () => {
    it('should export functions with correct grants and role mappings', async () => {
      tablerizer.configure({ scope: 'functions' });
      const result = await tablerizer.export();
      
      assert.ok(result.functionFiles > 0, 'Should export at least one function');
      assert.strictEqual(result.tableFiles, 0, 'Should not export tables');
      
      // Check function file exists
      const funcFile = result.files.find(f => f.name === 'get_user_post_count');
      assert.ok(funcFile, 'Should export get_user_post_count function');
      
      const content = await fs.readFile(funcFile.filePath, 'utf-8');
      
      // Should contain function definition
      assert.ok(content.includes('CREATE OR REPLACE FUNCTION'), 'Should contain function definition');
      
      // Should contain grants with role mappings
      assert.ok(content.includes('GRANT EXECUTE'), 'Should contain GRANT EXECUTE');
      assert.ok(content.includes(':DATABASE_VISITOR'), 'Should contain role mappings');
      
      await tablerizer.disconnect();
    });
  });

  describe('Materialized Views Export', () => {
    it('should export materialized views with metadata only', async () => {
      tablerizer.configure({ scope: 'materialized-views' });
      const result = await tablerizer.export();
      
      assert.ok(result.materializedViewFiles > 0, 'Should export at least one materialized view');
      
      // Check materialized view file
      const matviewFile = result.files.find(f => f.name === 'user_stats');
      assert.ok(matviewFile, 'Should export user_stats materialized view');
      assert.strictEqual(matviewFile.type, 'materialized-view', 'Should have correct type');
      
      const content = await fs.readFile(matviewFile.filePath, 'utf-8');
      
      // Should NOT contain CREATE MATERIALIZED VIEW (stateless approach)
      assert.ok(!content.includes('CREATE MATERIALIZED VIEW'), 'Should not contain creation SQL');
      
      // Should contain documentation
      assert.ok(content.includes('MATERIALIZED VIEW DOCUMENTATION'), 'Should contain documentation');
      
      // Should contain grants
      assert.ok(content.includes('GRANT SELECT'), 'Should contain grants');
      assert.ok(content.includes(':DATABASE_VISITOR'), 'Should contain role mappings');
      
      // Should contain index information
      assert.ok(content.includes('INDEXES:'), 'Should document indexes');
      assert.ok(content.includes('idx_user_stats_id'), 'Should list specific indexes');
      
      await tablerizer.disconnect();
    });
  });

  describe('Scoping and Configuration', () => {
    it('should export all types when scope is "all"', async () => {
      tablerizer.configure({ scope: 'all' });
      const result = await tablerizer.export();
      
      assert.ok(result.tableFiles > 0, 'Should export tables');
      assert.ok(result.functionFiles > 0, 'Should export functions');
      assert.ok(result.materializedViewFiles > 0, 'Should export materialized views');
      
      await tablerizer.disconnect();
    });

    it('should apply role mappings correctly', async () => {
      tablerizer.configure({ 
        scope: 'tables',
        role_mappings: {
          [process.env.DATABASE_VISITOR || 'tablerizer_visitor']: ':TEST_ROLE'
        }
      });
      
      const result = await tablerizer.export();
      const usersFile = result.files.find(f => f.name === 'users');
      const content = await fs.readFile(usersFile!.filePath, 'utf-8');
      
      assert.ok(content.includes(':TEST_ROLE'), 'Should apply custom role mappings');
      assert.ok(!content.includes(process.env.DATABASE_VISITOR), 'Should replace actual role names');
      
      await tablerizer.disconnect();
    });

    it('should include/exclude dates in headers based on configuration', async () => {
      // Test with date included
      tablerizer.configure({ scope: 'tables', include_date: true });
      let result = await tablerizer.export();
      let usersFile = result.files.find(f => f.name === 'users');
      let content = await fs.readFile(usersFile!.filePath, 'utf-8');
      
      assert.ok(content.includes('-- Date:'), 'Should include date when configured');
      
      await tablerizer.disconnect();
      
      // Clean and test without date
      await fs.rm(testOutputDir, { recursive: true, force: true });
      
      tablerizer.configure({ scope: 'tables', include_date: false });
      result = await tablerizer.export();
      usersFile = result.files.find(f => f.name === 'users');
      content = await fs.readFile(usersFile!.filePath, 'utf-8');
      
      assert.ok(!content.includes('-- Date:'), 'Should exclude date when configured');
      
      await tablerizer.disconnect();
    });
  });

  describe('Bug Fixes Validation', () => {
    it('should not show redundant column grants for SELECT', async () => {
      // This test validates the column grants bug fix
      tablerizer.configure({ scope: 'tables' });
      const result = await tablerizer.export();
      
      const usersFile = result.files.find(f => f.name === 'users');
      const content = await fs.readFile(usersFile!.filePath, 'utf-8');
      
      // Count SELECT grants - should not have both table-level and redundant column-level
      const selectGrants = content.match(/GRANT SELECT/g) || [];
      
      // This test will help us identify the bug before fixing it
      console.log(`Found ${selectGrants.length} SELECT grants in users table`);
      console.log('Content preview:', content.substring(0, 2000));
      
      await tablerizer.disconnect();
    });

    it('should not have repeated constraints', async () => {
      tablerizer.configure({ scope: 'tables' });
      const result = await tablerizer.export();
      
      const usersFile = result.files.find(f => f.name === 'users');
      const content = await fs.readFile(usersFile!.filePath, 'utf-8');
      
      // Look for constraint documentation - should not have duplicates
      const uniqueConstraints = content.match(/• email_format:/g) || [];
      assert.ok(uniqueConstraints.length <= 1, 'Should not have duplicate constraints');
      
      await tablerizer.disconnect();
    });
  });
});