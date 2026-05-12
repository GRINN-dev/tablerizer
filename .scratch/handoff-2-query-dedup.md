# Handoff: Deduplicate query functions with role filtering

## Context

Tablerizer is a PostgreSQL schema visibility tool. See `CONTEXT.md` for domain vocabulary. Branch: `feature/config-module-deepening` (or a new branch from it).

## Problem

`src/queries.ts` has 14 query functions. Three groups share nearly identical code:

### Group 1: Grant queries (copy-pasted role filtering)
- `getTableGrants(connection, schema, tableName, roles?)` 
- `getColumnGrants(connection, schema, tableName, roles?)`
- `getMaterializedViewGrants(connection, schema, matviewName, roles?)`

All three build the same `roleFilter` string and `params` array:
```typescript
const roleFilter = roles ? `AND grantee = ANY($3)` : "";
const params = [schema, name];
if (roles) params.push(roles as any);
```

### Group 2: Similar structural patterns
- `getTables`, `getFunctions`, `getMaterializedViews` — all list objects in a schema
- `getTableData` — aggregates 9 parallel queries

## Goal

Centralize role filtering so adding a new grant type doesn't require copy-pasting. Options:

### Option A: Parameterized grant query
One function: `getGrants(connection, schema, objectName, source, roles?)` where `source` selects between `table_privileges` and `column_privileges`.

### Option B: Role filter builder
Extract the `roleFilter + params` logic into a shared helper that each grant function calls.

Option A is deeper (one function instead of three). Option B is safer (smaller change).

## Approach

Use `/tdd`. Start with a test that calls the new unified grant function for table grants, verify it returns the same results as the old `getTableGrants`. Then extend to column grants and materialized view grants.

## Key files to read

- `src/queries.ts` — all 14 query functions, focus on the three grant functions (lines ~118-140, ~378-420)
- `src/database.ts` — `DatabaseConnection` interface
- `test/integration/grants.test.ts` — existing grant integration tests
- `CONTEXT.md` — domain vocabulary

## Constraints

- Keep the same data shapes returned (grant objects with grantor, grantee, privilege, is_grantable)
- Integration tests must keep passing
- Use Bun runtime (bun test, Bun SQL)
