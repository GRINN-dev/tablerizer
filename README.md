# 🛡️ pgrbac - PostgreSQL RBAC/RLS Export Tool

**pgrbac** is a powerful command-line tool that generates SQL files to recreate PostgreSQL table privileges (RBAC), Row Level Security (RLS) policies, triggers, constraints, and comprehensive table documentation.

Perfect for database migrations, environment synchronization, and integration with tools like **Graphile Migrate**.

## ✨ Features

- 🏗️ **Complete Database Schema Export** - Tables, privileges, policies, triggers, constraints
- 🔐 **RBAC & RLS Support** - Full table and column-level permissions with RLS policies
- 🗝️ **Role Mapping** - Replace database roles with placeholders (perfect for Graphile Migrate)
- 📝 **Rich Documentation** - Includes table schema, foreign keys, constraints, and comments
- ⚡ **Multi-Schema Support** - Export multiple schemas with organized folder structure
- 🔧 **Flexible Configuration** - CLI args, config files, or environment variables
- 🧹 **Idempotent Scripts** - Generated SQL includes cleanup sections for safe re-runs

## 🚀 Quick Start

### Install Dependencies

```bash
bun install
```

### Basic Usage

```bash
# Automatic config detection (.pgrbarc)
bun index.ts

# Specify schemas directly
bun index.ts --schemas "app_public,app_private" --out ./exports

# Use configuration file
bun index.ts --config ./config.json
```

## ⚙️ Configuration

### Automatic Config Detection

pgrbac automatically looks for configuration files in this order:

- `.pgrbarc`
- `.pgrbarc.json`

### Config File Format

```json
{
  "schemas": ["app_public", "app_private"],
  "out": "./exports",
  "roles": ["admin", "user", "visitor"],
  "database_url": "postgres://user:password@localhost:5432/database",
  "role_mappings": {
    "myapp_admin": ":DATABASE_ADMIN",
    "myapp_user": ":DATABASE_USER",
    "myapp_visitor": ":DATABASE_VISITOR"
  }
}
```

### Environment Variables

```bash
DATABASE_URL="postgres://user:pass@host:5432/db"
SCHEMAS="app_public,app_private"
OUTPUT_DIR="./exports"
ROLES="admin,user"
```

## 🎯 Role Mappings for Graphile Migrate

pgrbac's role mapping feature is perfect for Graphile Migrate workflows:

```json
{
  "role_mappings": {
    "myapp_admin": ":DATABASE_ADMIN",
    "myapp_user": ":DATABASE_USER"
  }
}
```

**Generated SQL contains placeholders:**

```sql
GRANT SELECT ON TABLE users TO :DATABASE_ADMIN;
REVOKE ALL ON TABLE users FROM :DATABASE_VISITOR;
```

Graphile Migrate replaces `:DATABASE_ADMIN` with actual roles during deployment.

## 📁 Output Structure

```
exports/
├── app_public/
│   ├── users.sql
│   ├── posts.sql
│   └── _default_privileges.sql
└── app_private/
    ├── sessions.sql
    └── audit_log.sql
```

Each SQL file contains:

- 🧹 **Cleanup Section** - Drops existing policies, triggers, revokes grants
- 🏗️ **Recreation Section** - Creates RLS policies, grants, triggers
- 📋 **Schema Documentation** - Table structure, foreign keys, constraints, comments

## 🔧 CLI Options

```bash
bun index.ts [options]

Options:
  --schemas <list>     Schema names (comma-separated)
  --out <directory>    Output directory (default: ./tables/)
  --roles <list>       Filter by roles (comma-separated)
  --config <file>      Configuration file path
  --help               Show help information
  --version            Show version information
```

---

**Made with ❤️ for PostgreSQL database management**
