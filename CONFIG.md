# Table Export Configuration

This script supports multiple ways to configure your table exports: CLI arguments, configuration files, and environment variables.

## Configuration Priority

1. **CLI Arguments** (highest priority)
2. **Environment Variables**
3. **Configuration File** (lowest priority)

## Configuration File

Create a `config.json` file with the following structure:

```json
{
  "schemas": ["app_public", "app_private"],
  "out": "./exports",
  "roles": ["role1", "role2"],
  "database_url": "postgres://user:password@localhost:5432/database",
  "role_mappings": {
    "actual_role_name": ":PLACEHOLDER_NAME",
    "graphile_starter_admin": ":DATABASE_ADMIN",
    "graphile_starter_auth": ":DATABASE_AUTHENTICATOR",
    "graphile_starter_anon": ":DATABASE_VISITOR"
  }
}
```

### Role Mappings

The `role_mappings` feature allows you to replace actual database role names with placeholders in the generated SQL files. This is perfect for use with tools like Graphile Migrate where you want to use placeholders that get replaced during deployment.

**Basic Example:**

- Database has role: `my_app_visitor`
- Config maps: `"my_app_visitor": ":DATABASE_VISITOR"`
- Generated SQL will contain: `GRANT SELECT TO :DATABASE_VISITOR`

**🌍 Environment Variables in Keys (v1.5.0+)**

You can now use environment variables in role mapping **keys** for dynamic, environment-specific configurations:

```json
{
  "role_mappings": {
    "$DATABASE_VISITOR": ":DATABASE_VISITOR",
    "$DATABASE_AUTHENTICATOR": ":DATABASE_AUTHENTICATOR"
  }
}
```

With environment variables set:
```bash
export DATABASE_VISITOR="cap_commun_azimuth_visitor"
export DATABASE_AUTHENTICATOR="cap_commun_azimuth_authenticator"
```

This expands to:
```json
{
  "role_mappings": {
    "cap_commun_azimuth_visitor": ":DATABASE_VISITOR",
    "cap_commun_azimuth_authenticator": ":DATABASE_AUTHENTICATOR"
  }
}
```

**Benefits:**
- Single config file for all environments
- Role names from environment-specific variables
- Perfect for Docker/Kubernetes deployments
- Reduces configuration duplication

## Usage Examples

### Using Config File

```bash
bun index.ts --config ./config.json
```

### Using Environment Variables

```bash
SCHEMAS="app_public,app_private" \
OUTPUT_DIR="./exports" \
ROLES="role1,role2" \
DATABASE_URL="postgres://..." \
bun index.ts
```

### Using CLI Arguments

```bash
bun index.ts --schemas "app_public,app_private" --out ./exports --roles "role1,role2"
```

### Mixed Approach

```bash
# Use config file as base, override output directory
bun index.ts --config ./config.json --out ./custom_output
```

## Environment Variables

- `SCHEMAS` - Comma-separated list of schema names
- `OUTPUT_DIR` - Output directory path
- `ROLES` - Comma-separated list of role names to filter
- `DATABASE_URL` - PostgreSQL connection string

## Benefits

1. **Version Control**: Store configuration in git for consistent builds
2. **Environment-Specific**: Different configs for dev/staging/prod
3. **Graphile Migrate Integration**: Use placeholders that get replaced during deployment
4. **Automation**: Easy integration with CI/CD pipelines
5. **Flexibility**: Override any setting as needed

## Graphile Migrate Integration

When using with Graphile Migrate, your role mappings might look like:

```json
{
  "role_mappings": {
    "myapp_admin": ":DATABASE_ADMIN",
    "myapp_user": ":DATABASE_USER",
    "myapp_anon": ":DATABASE_VISITOR",
    "myapp_authenticator": ":DATABASE_AUTHENTICATOR"
  }
}
```

The generated SQL files will contain placeholders that Graphile Migrate can replace during deployment.
