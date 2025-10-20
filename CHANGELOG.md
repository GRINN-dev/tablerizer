# Changelog

All notable changes to Tablerizer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/GRINN-dev/tablerizer/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/GRINN-dev/tablerizer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/GRINN-dev/tablerizer/releases/tag/v1.0.0
