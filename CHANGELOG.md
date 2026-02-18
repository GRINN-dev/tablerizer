# Changelog

All notable changes to Tablerizer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-02-18

### BREAKING CHANGES

- **Complete DDL Export** - Table export now generates full, executable DDL instead of permissions-only SQL
  - Each table file now includes `DROP TABLE IF EXISTS ... CASCADE` + `CREATE TABLE` with exact column definitions
  - Column definitions sourced from `pg_catalog` (pg_dump-style exact types: `integer`, `text[]`, `timestamp with time zone`, etc.)
  - Constraints exported as idempotent `ALTER TABLE DROP CONSTRAINT IF EXISTS` + `ALTER TABLE ADD CONSTRAINT` (PK, UNIQUE, FK, CHECK, EXCLUSION)
  - Indexes exported as idempotent `DROP INDEX IF EXISTS` + `CREATE INDEX`
  - Table/column/index comments exported as `COMMENT ON TABLE/COLUMN/INDEX` statements
  - Table ownership exported as `ALTER TABLE ... OWNER TO` (with role mapping support)
  - Partition strategy (`PARTITION BY RANGE/LIST/HASH`) included for partitioned tables
  - The documentation block (`/* TABLE SCHEMA DOCUMENTATION */`) has been **removed** -- all information is now in executable SQL

### Added

- **`generateDropTableSQL()`** - Modular generator for `DROP TABLE IF EXISTS ... CASCADE`
- **`generateCreateTableSQL()`** - Modular generator for `CREATE TABLE` with pg_catalog-sourced column definitions
- **`generateOwnerSQL()`** - Modular generator for `ALTER TABLE ... OWNER TO`
- **`generateConstraintsSQL()`** - Modular generator for idempotent constraint management
- **`generateIndexesSQL()`** - Modular generator for idempotent index management
- **`generateCommentsSQL()`** - Modular generator for `COMMENT ON TABLE/COLUMN` statements
- **`generateIndexCommentsSQL()`** - Modular generator for `COMMENT ON INDEX` statements
- **`generateRlsSQL()`** - Modular generator combining RLS enable + policy management (with inline `DROP POLICY IF EXISTS`)
- **New pg_catalog queries** for precise introspection:
  - `getColumnDefinitions()` - Uses `pg_attribute` + `pg_type` + `pg_attrdef` + `format_type()` for exact types
  - `getConstraintDefinitions()` - Uses `pg_constraint` + `pg_get_constraintdef()` for exact constraint definitions
  - `getIndexDefinitions()` - Uses `pg_class` + `pg_index` + `pg_get_indexdef()` (excludes constraint-backing indexes)
  - `getPartitionInfo()` - Uses `pg_partitioned_table` + `pg_get_partkeydef()` for partition strategy
- **Parallel data gathering** - All table introspection queries now run in parallel via `Promise.all()` for better performance
- **Section delimiters** - Each section of the generated SQL is clearly delimited with comment headers:
  `-- ----------------------------------------`
  `-- SECTION NAME`
  `-- ----------------------------------------`

### Changed

- **Table file structure** completely redesigned with 10 ordered sections:
  1. Header (table name, generator attribution)
  2. DROP TABLE (idempotent cleanup)
  3. CREATE TABLE (full DDL with columns)
  4. OWNER (table ownership)
  5. CONSTRAINTS (PK, UNIQUE, FK, CHECK, EXCLUSION)
  6. INDEXES (non-constraint indexes)
  7. COMMENTS (table, column, and index comments)
  8. ROW LEVEL SECURITY (enable + policies with inline DROP/CREATE)
  9. GRANTS (table-level + column-level with REVOKE ALL cleanup)
  10. TRIGGERS (with inline DROP/CREATE)
- **Deterministic output** reinforced: all constraints sorted by type then name, all indexes by name, all policies by name, all triggers by name, all grants by grantee then privilege
- **Idempotent by design**: every construct uses DROP IF EXISTS before CREATE/ADD, making scripts safe to run repeatedly

### Removed

- `generateSchemaDocumentation()` - Replaced by executable DDL (no more documentation-only comment blocks)
- Legacy `getColumns()` method (replaced by `getColumnDefinitions()` using pg_catalog)
- Legacy `getConstraints()` method (replaced by `getConstraintDefinitions()` using pg_catalog)
- Legacy `getTableIndexes()` method (replaced by `getIndexDefinitions()` using pg_catalog)

## [1.5.0] - 2025-11-13

### Added

- 🌍 **Environment Variables in Role Mapping Keys** - powerful configuration flexibility
  - Support `$VAR` syntax in `role_mappings` keys for dynamic role configuration
  - Example: `"$DATABASE_VISITOR": ":DATABASE_VISITOR"` expands from environment
  - Enables environment-specific role configurations without code changes
  - Perfect for multi-environment deployments (dev, staging, prod)
  - Works with existing `${VAR}` and `${VAR:default}` syntax

### Fixed

- 🔧 **Deterministic Role Headers in Function Exports** - fixes non-deterministic output
  - Apply role mappings to roles in function file headers
  - Header now shows: `-- Grants for roles: :DATABASE_VISITOR, :DATABASE_AUTHENTICATOR`
  - Previously showed unmapped role names causing non-deterministic output
  - Ensures consistent headers across exports for CI/CD workflows

## [1.4.6] - 2025-11-05

### Fixed

- 🤫 **Enhanced Silent Mode** - improves automation-friendly output
  - Silent mode now shows minimal essential information instead of complete silence
  - Displays concise connection status, processing updates, and completion summary
  - Perfect balance between automation needs and basic monitoring
  - Format: "Exporting schema1,schema2 to ./exports" → "Processing..." → "Complete: 15 files exported to ./exports"

## [1.4.5] - 2025-11-05

### Fixed

- 🔑 **Constraint Column Ordering** - fixes non-deterministic ordering in multi-column constraints
  - Group constraint columns by constraint name for PRIMARY KEY, UNIQUE, and FOREIGN KEY constraints
  - Sort column names alphabetically within each constraint (e.g., `id, name` instead of random order)
  - Sort constraint names alphabetically for consistent documentation order
  - Handles composite keys and multi-column constraints properly
  - Eliminates remaining non-deterministic behavior in schema documentation

## [1.4.4] - 2025-11-04

### Fixed

- 🔄 **Column Grant Operation Sorting** - fixes missing deterministic sorting for operation types
  - Sort column grants by grantee, then privilege/operation type (INSERT, SELECT, UPDATE), then grantable status
  - Ensures consistent ordering: INSERT before SELECT before UPDATE for same grantee
  - Eliminates remaining non-deterministic behavior in column-level GRANT statements
  - Critical fix for complete deterministic output in CI/CD workflows

## [1.4.3] - 2025-11-04

### Fixed

- 🎯 **Comprehensive Deterministic Output** - eliminates all sources of non-deterministic behavior (initial release)

## [1.4.2] - 2025-11-04

### Fixed

- 🎯 **Comprehensive Deterministic Output** - eliminates all sources of non-deterministic behavior
  - Sort table grants by grantee then privilege for consistent GRANT statements
  - Sort materialized view grants by grantee then privilege
  - Sort function execution grants by role name alphabetically
  - Sort trigger names alphabetically in DROP TRIGGER statements (cleanup section)
  - Sort grantees alphabetically in REVOKE ALL statements (cleanup section)
  - Sort constraints by name before categorization in documentation
  - Sort indexes by name in both table and materialized view documentation
  - Sort permissions by privilege then grantee in materialized view documentation
  - Ensures 100% repeatable outputs for CI/CD workflows and version control

## [1.4.1] - 2025-11-04

### Fixed

- 🔄 **Deterministic Column Grant Output** - ensures repeatable results
  - Sort column names alphabetically in column-level GRANT statements
  - Add ORDER BY clauses to column_privileges and table_privileges queries
  - Guarantees consistent output order across multiple exports
  - Critical for CI/CD workflows and version control comparisons

## [1.4.0] - 2025-01-16

### Added

- 🤫 **Silent Mode** for automation workflows

  - Add `--silent` CLI flag to suppress all output except errors
  - Add `silent` option to Config, TablerizerOptions, and CliArgs interfaces
  - Perfect for CI/CD pipelines and automated scripts
  - Suppresses banner, progress output, and completion summary

- 📊 **Index Comments** in table documentation

  - Add comprehensive index information with comments to table schema documentation
  - Include index definitions and descriptions for better understanding
  - Exclude automatically generated primary key indexes for cleaner output
  - Enhanced table data structure with index metadata

- 🔗 **Schema-Qualified Foreign Key Display**
  - Automatically display schema-qualified names for cross-schema foreign key references
  - Enhanced clarity when foreign keys reference tables in different schemas
  - Same-schema references remain unqualified for cleaner output
  - Improved constraint query to include foreign table schema information

### Fixed

- 🧹 **Configuration Management** - enhanced configuration interfaces for new features
- 📋 **Documentation Generation** - improved foreign key and index documentation

## [1.3.0] - 2025-01-16

### Added

- 📅 **Configurable Date Display** in generated file headers
  - Add `include_date` option to Config, TablerizerOptions, and CliArgs interfaces
  - Add `--include-date` and `--no-date` CLI flags
  - Default behavior: exclude date from headers (backward compatible)
  - Support for JSON config file: `"include_date": true/false`

### Fixed

- 🔧 **Partitioned Table Handling** - properly handle PostgreSQL partitioned tables
  - Include partitioned tables (`relkind = 'p'`) in exports
  - Exclude individual partitions that inherit from partitioned parents
  - Prevents duplicate exports of parent table + individual partitions
  - Maintains logical table structure with parent-level RBAC/RLS management
  - Updated all table querying methods to support both ordinary and partitioned tables

## [1.1.0] - 2025-10-16

### Added

- 🎯 **Environment Variable Interpolation** in config files
  - Support for `$VAR` simple variable expansion
  - Support for `${VAR}` braced variable expansion
  - Support for `${VAR:default}` variables with default values
  - Support for `${VAR:}` variables with empty defaults
- 🔐 **Enhanced Security** by allowing sensitive data to stay in environment variables
- 📝 **Comprehensive Documentation** with environment variable examples
- 🧪 **Test Coverage** for environment variable expansion functionality

### Changed

- 📋 **Config Loading** now processes environment variables before validation
- 📖 **README** updated with environment variable syntax and examples

### Security

- 🔒 Database credentials and sensitive data can now be kept in environment variables instead of config files

## [1.0.0] - 2025-10-16

### Added

- 🎲 **Initial Release** of Tablerizer - PostgreSQL Table Export Wizard
- 🏗️ **Complete Database Schema Export** - Tables, privileges, policies, triggers, constraints
- 🔐 **RBAC & RLS Support** - Full table and column-level permissions with RLS policies
- 🗝️ **Role Mapping** - Replace database roles with placeholders (perfect for Graphile Migrate)
- 📝 **Rich Documentation** - Includes table schema, foreign keys, constraints, and comments
- ⚡ **Multi-Schema Support** - Export multiple schemas with organized folder structure
- 🔧 **Flexible Configuration** - CLI args, config files, or environment variables
- 🧹 **Idempotent Scripts** - Generated SQL includes cleanup sections for safe re-runs
- 📦 **TypeScript Library** - Use as a library in your Node.js applications
- 🎨 **Beautiful CLI** - Wizard-themed command-line interface with progress reporting
- 🔮 **Function Export** - Export stored procedures and functions with GRANT EXECUTE
- 📊 **Flexible Scope** - Export tables, functions, or both with scope configuration

### Features

- **CLI Usage**: Global and local installation support
- **Library Usage**: Programmatic API for Node.js applications
- **Configuration**: Auto-detection of `.tablerizerrc` files
- **Output Structure**: Organized folder structure with schema separation
- **Security**: Role mapping for safe deployment workflows

[Unreleased]: https://github.com/GRINN-dev/tablerizer/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/GRINN-dev/tablerizer/compare/v1.5.0...v2.0.0
[1.5.0]: https://github.com/GRINN-dev/tablerizer/compare/v1.4.3...v1.5.0
[1.4.6]: https://github.com/GRINN-dev/tablerizer/compare/v1.4.3...v1.4.6
[1.4.5]: https://github.com/GRINN-dev/tablerizer/compare/v1.4.3...v1.4.5
[1.4.4]: https://github.com/GRINN-dev/tablerizer/compare/v1.4.3...v1.4.4
[1.4.3]: https://github.com/GRINN-dev/tablerizer/compare/v1.4.0...v1.4.3
[1.4.2]: https://github.com/GRINN-dev/tablerizer/compare/v1.4.0...v1.4.2
[1.4.1]: https://github.com/GRINN-dev/tablerizer/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/GRINN-dev/tablerizer/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/GRINN-dev/tablerizer/compare/v1.1.0...v1.3.0
[1.1.0]: https://github.com/GRINN-dev/tablerizer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/GRINN-dev/tablerizer/releases/tag/v1.0.0
