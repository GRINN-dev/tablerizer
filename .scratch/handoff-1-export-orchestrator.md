# Handoff: Split the export() god method

## Context

Tablerizer is a PostgreSQL schema visibility tool. It generates **snapshots** (SQL files) of database objects. See `CONTEXT.md` for domain vocabulary, `docs/adr/0001-centralize-config-resolution.md` for the config decision.

Branch: `feature/config-module-deepening` (or create a new branch from it).

## Problem

`src/tablerizer.ts` — the `export()` method is ~220 lines mixing:
- Config validation
- Directory creation/cleanup
- Nested loops over schemas × object types (tables, functions, materialized views)
- Progress tracking
- Database queries (via `queries.ts`)
- SQL generation (via generators)
- File I/O (fs.writeFile)
- Overloaded function filename dedup

It's only testable via integration tests (real DB + real filesystem). No unit test coverage.

## Goal

Split into an orchestration pipeline with testable seams. Proposed modules:

1. **Scanner** — given a connection + schemas + object types, returns a list of `{ schema, name, objectType }` to export. Pure query, no I/O.
2. **SnapshotGenerator** — given a connection + object descriptor, returns the SQL string. Calls queries + generators. No file I/O.
3. **Writer** — given a list of `{ path, content }`, writes them to disk. Pure I/O, no logic.
4. **Orchestrator** — wires Scanner → SnapshotGenerator → Writer with progress tracking.

Each module is independently testable:
- Scanner: mock the connection, verify the object list
- SnapshotGenerator: already well-tested via existing generator unit tests
- Writer: test against a temp dir
- Orchestrator: test with stubs for the other three

## Approach

Use `/tdd` — vertical slices, one test at a time. Start with Scanner (simplest seam). The existing integration tests in `test/integration/` must keep passing.

## Key files to read

- `src/tablerizer.ts` — the god method to split
- `src/queries.ts` — database queries (Scanner will wrap these)
- `src/generators/index.ts` — SQL generators (SnapshotGenerator will call these)
- `test/integration/` — existing integration tests to preserve
- `CONTEXT.md` — domain vocabulary (snapshot, object type, export)
- `docs/adr/0001-centralize-config-resolution.md` — prior decision

## Constraints

- Keep `Tablerizer` class public API unchanged (constructor, connect, disconnect, export, exportTable, exportFunction)
- Use Bun runtime (bun test, Bun SQL) — no npm/node dependencies
- Tests use `node:test` describe/it + `node:assert/strict` (bun is compatible)
