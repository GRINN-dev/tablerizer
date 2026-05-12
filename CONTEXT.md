# Tablerizer

A PostgreSQL schema visibility tool for database-centric workflows. Tablerizer
extracts the logic buried in a PostgreSQL database (DDL, constraints, grants,
RLS policies, triggers) into readable SQL files that can be versioned in Git,
navigated by humans, and explored by AI agents.

## Language

**Snapshot**:
The SQL file generated for a single database object — a complete, idempotent
representation of its current state.
_Avoid_: export (ambiguous — also means the action), output, file

**Object type**:
The kind of database object targeted by an export: table, function, view,
or materialized view.
_Avoid_: scope

**Export**:
The action of running Tablerizer against a database to generate snapshots.

**Role mapping**:
Substitution of real database role names with environment-portable placeholders
(e.g. `myapp_admin` → `:DATABASE_ADMIN`). A convenience for the Graphile Migrate
workflow, not a core concept.
_Avoid_: role replacement, role substitution

## Relationships

- An **Export** targets one or more PostgreSQL schemas and produces **Snapshots**
  organized by schema and **Object type**
- A **Snapshot** contains the complete DDL + metadata (constraints, indexes,
  comments, RLS, grants, triggers) for exactly one database object
- **Role mapping** is applied to **Snapshots** during an **Export**

## Example dialogue

> **Dev:** "I changed a RLS policy on `app_public.users` but my PostGraphile
> query still returns empty. What's going on?"
> **Domain expert:** "Pull up the **snapshot** for `users` — check the grants
> and policies section. Tablerizer shows you everything the database enforces,
> so if a permission is missing, you'll see it there."

> **Dev:** "How do I add the new function to version control?"
> **Domain expert:** "Just run an **export** — Tablerizer will generate a
> **snapshot** for it. Then copy the snapshot into your Graphile migration
> and edit from there."

## Flagged ambiguities

- "export" is both a noun (the result) and a verb (the action) — resolved:
  use **snapshot** for the result, **export** for the action.
- "scope" was used in code to mean **object type** — resolved: rename to
  object type, "scope" is misleading.
