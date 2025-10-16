# Changelog

All notable changes to Tablerizer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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