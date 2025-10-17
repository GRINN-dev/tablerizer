#!/usr/bin/env node

/**
 * Manual test database setup script
 * Usage: node test-setup.js
 */

import { createTestDatabase } from './test-database.js';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  try {
    console.log('🚀 Setting up test database...');
    
    const testDb = createTestDatabase();
    await testDb.initialize();
    
    console.log('📄 Loading test schema and fixtures...');
    const schemaPath = path.join(import.meta.dirname, 'fixtures/test-schema.sql');
    let schemaSql = await fs.readFile(schemaPath, 'utf-8');
    
    // Replace role placeholders with actual role names
    schemaSql = schemaSql.replace(/:DATABASE_VISITOR/g, process.env.DATABASE_VISITOR || 'tablerizer_visitor');
    schemaSql = schemaSql.replace(/:DATABASE_AUTHENTICATOR/g, process.env.DATABASE_AUTHENTICATOR || 'tablerizer_authenticator');
    
    await testDb.executeSQL(schemaSql);
    
    console.log('✅ Test database setup complete!');
    console.log(`📊 Database: ${process.env.DATABASE_NAME || 'tablerizer_test'}`);
    console.log(`🔗 Connection: ${process.env.DATABASE_URL}`);
    
    await testDb.destroy();
    
  } catch (error) {
    console.error('❌ Test setup failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}