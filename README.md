# 🎲 Tablerizer - PostgreSQL Table Export Wizard

[![npm version](https://badge.fury.io/js/tablerizer.svg)](https://badge.fury.io/js/tablerizer)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

**Tablerizer** is a powerful PostgreSQL table export wizard that generates SQL files to recreate table privileges (RBAC), Row Level Security (RLS) policies, triggers, constraints, and comprehensive table documentation.

Perfect for database migrations, environment synchronization, and integration with tools like **Graphile Migrate**.

## ✨ Features

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

## 🚀 Installation

### As a CLI Tool

```bash
npm install -g tablerizer
```

### As a Library

```bash
npm install tablerizer
```

## 🎯 Quick Start

### CLI Usage

```bash
# Automatic config detection (.tablerizerrc)
tablerizer

# Specify schemas directly
tablerizer --schemas "app_public,app_private" --out ./exports

# Export only functions
tablerizer --schemas "app_public" --scope functions --out ./functions

# Export both tables and functions (default)
tablerizer --schemas "app_public" --scope all
```

### Library Usage

```typescript
import { Tablerizer, exportTables, exportFunctions } from "tablerizer";

// Export both tables and functions
const result = await exportTables({
  schemas: ["app_public", "app_private"],
  database_url: "postgres://user:pass@localhost:5432/db",
  out: "./exports",
  scope: "all", // or ['tables', 'functions']
  roles: ["admin", "user"],
  role_mappings: {
    myapp_admin: ":DATABASE_ADMIN",
    myapp_user: ":DATABASE_USER",
  },
});

console.log(
  `Exported ${result.totalFiles} files (${result.tableFiles} tables, ${result.functionFiles} functions)`
);

// Export only functions
const functionsResult = await exportFunctions({
  schemas: ["app_public"],
  database_url: process.env.DATABASE_URL,
  roles: ["admin", "user"],
});
```

#### Advanced Library Usage

```typescript
import { Tablerizer } from "tablerizer";

const tablerizer = new Tablerizer({
  schemas: ["app_public"],
  database_url: process.env.DATABASE_URL,
  scope: "all", // Export both tables and functions
  role_mappings: {
    myapp_admin: ":DATABASE_ADMIN",
  },
});

// Export all with progress reporting
const result = await tablerizer.export((progress) => {
  console.log(
    `Processing ${progress.schema}.${progress.table} (${progress.progress}/${progress.total})`
  );
});

// Export a single table
const tableSql = await tablerizer.exportTable(
  "app_public",
  "users",
  "./users.sql"
);

// Export a single function
const functionSql = await tablerizer.exportFunction(
  "app_public",
  "get_user_by_id",
  "./get_user_by_id.sql"
);

// Export only functions
const functionsResult = await tablerizer.exportFunctions();

// Export only tables
const tablesResult = await tablerizer.exportTables();

// Clean up
await tablerizer.disconnect();
```

## ⚙️ Configuration

### Automatic Config Detection

Tablerizer automatically looks for configuration files in this order:

- `.tablerizerrc`
- `.tablerizerrc.json`

### Config File Format

#### Basic Configuration

```json
{
  "schemas": ["app_public", "app_private"],
  "out": "./exports",
  "roles": ["admin", "user", "visitor"],
  "database_url": "postgres://user:password@localhost:5432/database",
  "scope": "all",
  "role_mappings": {
    "myapp_admin": ":DATABASE_ADMIN",
    "myapp_user": ":DATABASE_USER",
    "myapp_visitor": ":DATABASE_VISITOR"
  }
}
```

#### With Environment Variables 🎯

Tablerizer supports environment variable interpolation in config files using `$` syntax:

```json
{
  "schemas": ["app_public", "app_private"],
  "out": "${OUTPUT_DIR:./exports}",
  "roles": ["$ADMIN_ROLE", "$USER_ROLE", "${VISITOR_ROLE:visitor}"],
  "database_url": "$DATABASE_URL",
  "scope": "${EXPORT_SCOPE:all}",
  "role_mappings": {
    "myapp_admin": "${ADMIN_PLACEHOLDER::DATABASE_ADMIN}",
    "myapp_user": "${USER_PLACEHOLDER::DATABASE_USER}",
    "myapp_visitor": "${VISITOR_PLACEHOLDER::DATABASE_VISITOR}"
  }
}
```

**Environment Variable Syntax:**

- `$VAR` - Simple variable expansion
- `${VAR}` - Braced variable expansion
- `${VAR:default}` - Variable with default value
- `${VAR:}` - Variable with empty default

**Example .env file:**

```bash
DATABASE_URL="postgres://user:pass@host:5432/db"
OUTPUT_DIR="./my-exports"
ADMIN_ROLE="admin"
USER_ROLE="user"
EXPORT_SCOPE="all"
ADMIN_PLACEHOLDER=":DATABASE_ADMIN"
USER_PLACEHOLDER=":DATABASE_USER"
```

### Environment Variables

```bash
DATABASE_URL="postgres://user:pass@host:5432/db"
SCHEMAS="app_public,app_private"
OUTPUT_DIR="./exports"
ROLES="admin,user"
```

## 🎯 Role Mappings for Graphile Migrate

Tablerizer's role mapping feature is perfect for Graphile Migrate workflows:

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
│   ├── tables/
│   │   ├── users.sql
│   │   ├── posts.sql
│   │   └── comments.sql
│   └── functions/
│       ├── get_user_by_id.sql
│       └── create_post.sql
└── app_private/
    ├── tables/
    │   ├── sessions.sql
    │   └── audit_log.sql
    └── functions/
        └── cleanup_sessions.sql
```

Each SQL file contains:

**Table Files:**

- 🧹 **Cleanup Section** - Drops existing policies, triggers, revokes grants
- 🏗️ **Recreation Section** - Creates RLS policies, grants, triggers
- 📋 **Schema Documentation** - Table structure, foreign keys, constraints, comments

**Function Files:**

- 🔮 **CREATE OR REPLACE** - Idempotent function definitions
- 🔐 **GRANT EXECUTE** - Permission grants for specified roles
- 📝 **Comments** - Function descriptions and metadata

## 🔧 CLI Options

```bash
tablerizer [options]

SPELLBOOK (OPTIONS):
  --config <file>     📜 Path to configuration grimoire (JSON)
  --schemas <list>    🎯 Target schema realms, comma-separated
  --out <directory>   📁 Output sanctum (default: ./tables/)
  --roles <list>      🔐 Filter by magical roles, comma-separated
  --scope <type>      🎯 Export scope: tables, functions, or all (default: all)
  --help, -h         ❓ Show this magical help
  --version, -v      ℹ️  Show version of the wizard
```

## 📚 Library API

### Main Classes

#### `Tablerizer`

The main class for programmatic usage.

```typescript
class Tablerizer {
  constructor(options?: Partial<TablerizerOptions>);
  configure(options: Partial<TablerizerOptions>): void;
  async connect(connectionString?: string): Promise<void>;
  async disconnect(): Promise<void>;
  async export(progressCallback?: ProgressCallback): Promise<ExportResult>;
  async exportTable(
    schema: string,
    tableName: string,
    outputPath?: string
  ): Promise<string>;
  async exportFunction(
    schema: string,
    functionName: string,
    outputPath?: string
  ): Promise<string>;
  async exportTables(
    progressCallback?: ProgressCallback
  ): Promise<ExportResult>;
  async exportFunctions(
    progressCallback?: ProgressCallback
  ): Promise<ExportResult>;
}
```

### Types

```typescript
interface TablerizerOptions {
  schemas: string[];
  out?: string;
  roles?: string[];
  database_url?: string;
  role_mappings?: Record<string, string>;
  scope?: "tables" | "functions" | "all" | Array<"tables" | "functions">;
}

interface ExportResult {
  schemas: string[];
  totalFiles: number;
  tableFiles: number;
  functionFiles: number;
  outputPath: string;
  files: Array<{
    schema: string;
    name: string;
    type: "table" | "function";
    filePath: string;
    size: number;
  }>;
}

type ProgressCallback = (progress: {
  schema: string;
  table: string;
  progress: number;
  total: number;
}) => void;
```

### Convenience Functions

```typescript
// Export all tables quickly
async function exportTables(
  options: TablerizerOptions,
  progressCallback?: ProgressCallback
): Promise<ExportResult>;

// Export all functions quickly
async function exportFunctions(
  options: TablerizerOptions,
  progressCallback?: ProgressCallback
): Promise<ExportResult>;

// Export a single table
async function exportTable(
  schema: string,
  tableName: string,
  options: TablerizerOptions,
  outputPath?: string
): Promise<string>;

// Export a single function
async function exportFunction(
  schema: string,
  functionName: string,
  options: TablerizerOptions,
  outputPath?: string
): Promise<string>;
```

## 🛠️ Development

### Build from Source

```bash
git clone https://github.com/your-username/tablerizer.git
cd tablerizer
npm install
npm run build
```

### Project Structure

```
src/
├── index.ts      # Main Tablerizer class and exports
├── cli.ts        # CLI interface and help
├── config.ts     # Configuration management
├── database.ts   # Database connection utilities
└── generators.ts # SQL generation functions
bin/
└── tablerizer.js # CLI binary entry point
lib/              # Compiled JavaScript (generated)
```

### Scripts

```bash
npm run build         # Compile TypeScript
npm run dev          # Watch mode compilation
npm run clean        # Remove compiled files
npm test             # Run tests (when available)
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for the PostgreSQL community
- Designed to work seamlessly with Graphile Migrate
- Inspired by the need for better database permission management

---

**Made with ❤️ for PostgreSQL database management**

_"Let the magic of organized database permissions flow through your migrations!"_ 🧙‍♂️✨
