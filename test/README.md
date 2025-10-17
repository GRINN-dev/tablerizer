# Tablerizer Test Suite

Comprehensive integration tests using real PostgreSQL databases.

## Setup

1. **Database Requirements:**
   - PostgreSQL server running locally
   - Superuser access for creating databases and roles
   - Connection string in environment variables

2. **Environment Configuration:**
   ```bash
   # Copy and adjust the test environment
   cp test/.env.example .env.test
   
   # Edit .env.test with your database credentials
   ```

3. **Required Environment Variables:**
   ```bash
   DATABASE_URL="postgresql://user@localhost:5432/tablerizer_test"
   DATABASE_AUTHENTICATOR="tablerizer_authenticator"  
   DATABASE_AUTHENTICATOR_PASSWORD="123"
   DATABASE_NAME="tablerizer_test"
   DATABASE_OWNER="tablerizer_owner"
   DATABASE_OWNER_PASSWORD="123"
   DATABASE_VISITOR="tablerizer_visitor"
   ROOT_DATABASE_URL="postgresql://user@localhost:5432/postgres"
   ```

## Running Tests

```bash
# Build and run all tests
npm test

# Run tests with watch mode
npm run test:watch

# Manual database setup (for debugging)
npm run test:setup
```

## Test Structure

### Integration Tests (`integration.test.ts`)
- **Database Connection:** Validates connection and disconnection
- **Table Export:** Tests RBAC, RLS, partitioned tables, cross-schema FKs
- **Function Export:** Tests function definitions, grants, role mappings
- **Materialized Views:** Tests metadata-only export with indexes and grants
- **Configuration:** Tests scoping, role mappings, date inclusion
- **Bug Validation:** Tests for known issues and their fixes

### Test Database (`test-database.ts`)
- **Automated Setup:** Creates clean test database and roles
- **Schema Loading:** Loads comprehensive test schema with fixtures
- **Cleanup:** Automatically destroys test resources after tests
- **SQL Execution:** Helper methods for running SQL scripts

### Test Fixtures (`fixtures/test-schema.sql`)
- **Tables:** Regular tables, partitioned tables, cross-schema references
- **Views:** Regular views and materialized views with indexes
- **Functions:** Regular functions and SECURITY DEFINER functions  
- **Permissions:** Table grants, column grants, function grants
- **RLS:** Row Level Security policies on multiple tables
- **Triggers:** Update triggers and multi-event triggers
- **Constraints:** Primary keys, foreign keys, check constraints, unique constraints
- **Test Data:** Sample data to populate tables and materialized views

## Test Coverage

The test suite validates:

✅ **Core Functionality:**
- Database connection and disconnection
- Table export with complete RBAC and RLS
- Function export with grants and role mappings
- Materialized view export (metadata only)
- Scoping (tables, functions, materialized-views, all)

✅ **Advanced Features:**
- Partitioned table handling (excludes individual partitions)
- Cross-schema foreign key references
- Role mappings and placeholder replacement
- Configurable date headers
- Multi-schema exports

✅ **Bug Detection:**
- Column grants bug (redundant SELECT grants)
- Repeated constraints bug
- Role placeholder replacement in function headers

✅ **Edge Cases:**
- Empty schemas
- Complex constraint combinations
- Overloaded functions
- Multi-event triggers

## Adding New Tests

1. **Add test data to `fixtures/test-schema.sql`**
2. **Add test cases to `integration.test.ts`**
3. **Use descriptive test names and assertions**
4. **Clean up resources in test teardown**

Example test structure:
```typescript
describe('New Feature', () => {
  it('should behave as expected', async () => {
    tablerizer.configure({ /* config */ });
    const result = await tablerizer.export();
    
    // Validate results
    assert.ok(condition, 'Description');
    
    // Read and validate generated files
    const content = await fs.readFile(filePath, 'utf-8');
    assert.ok(content.includes('expected'), 'Should contain expected content');
    
    await tablerizer.disconnect();
  });
});
```

## Debugging Tests

- **Database Connection Issues:** Check PostgreSQL server and credentials
- **Permission Errors:** Ensure superuser access for test database creation
- **Schema Loading Errors:** Check SQL syntax in test fixtures
- **Test Timeouts:** Increase timeout in test configuration

The test suite creates and destroys databases automatically, so it's safe to run repeatedly without manual cleanup.