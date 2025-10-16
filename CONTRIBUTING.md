# 🤝 Contributing to Tablerizer

Thank you for considering contributing to Tablerizer! This document provides guidelines and information for contributors.

## 📋 Development Setup

1. **Fork & Clone**

   ```bash
   git clone https://github.com/YOUR_USERNAME/tablerizer.git
   cd tablerizer
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Build & Test**
   ```bash
   npm run build
   npm run check
   node bin/tablerizer.js --version
   ```

## 🔄 Release Process

### Semantic Versioning

We follow [Semantic Versioning](https://semver.org/):

- **PATCH** (1.0.1): Bug fixes
- **MINOR** (1.1.0): New features (backward compatible)
- **MAJOR** (2.0.0): Breaking changes

### Release Commands

```bash
# Patch release (bug fixes)
npm run release:patch

# Minor release (new features)
npm run release:minor

# Major release (breaking changes)
npm run release:major
```

### Manual Release Process

1. **Update Version & CLI**

   ```bash
   # Update package.json version
   # Update VERSION constant in src/cli.ts
   ```

2. **Commit & Tag**

   ```bash
   git add .
   git commit -m "feat: description of changes"
   git tag -a v1.2.0 -m "Release v1.2.0: Summary"
   ```

3. **Push & Publish**
   ```bash
   git push origin main
   git push origin v1.2.0
   # GitHub Actions will automatically publish to npm
   ```

## 🎯 Conventional Commits

Use conventional commit format:

```bash
feat: add new feature
fix: bug fix
docs: documentation changes
style: formatting, no code change
refactor: code change that neither fixes bug nor adds feature
test: adding tests
chore: updating build tasks, package manager configs, etc
```

## 🧪 Testing

### Manual Testing

```bash
# Test version
node bin/tablerizer.js --version

# Test help
node bin/tablerizer.js --help

# Test library import
node -e "import('./lib/index.js').then(m => console.log(Object.keys(m)))"

# Test with real database (optional)
DATABASE_URL="postgres://..." node bin/tablerizer.js --schemas "public"
```

### Environment Variable Testing

```bash
# Create test config
echo '{"database_url": "$TEST_DB", "schemas": ["$TEST_SCHEMA"]}' > .test-config

# Test expansion
TEST_DB="postgres://test" TEST_SCHEMA="public" node bin/tablerizer.js --config .test-config
```

## 📁 Project Structure

```
├── src/
│   ├── index.ts      # Main library exports
│   ├── cli.ts        # CLI interface
│   ├── config.ts     # Configuration management
│   ├── database.ts   # Database connections
│   └── generators.ts # SQL generation
├── bin/
│   └── tablerizer.js # CLI binary
├── lib/              # Compiled output (generated)
└── .github/
    └── workflows/    # GitHub Actions
```

## 🔒 Security

- Never commit actual database credentials
- Use environment variables for sensitive data
- Test environment variable interpolation thoroughly
- Audit dependencies regularly: `npm audit`

## 📝 Documentation

- Update README.md for new features
- Update CHANGELOG.md following Keep a Changelog format
- Add JSDoc comments for new functions
- Update examples and usage instructions

## 🚀 Publishing

### Automated (Recommended)

- Push tags trigger automatic npm publishing via GitHub Actions
- Releases are created automatically on GitHub
- Security audits run on every push

### Manual (Backup)

```bash
npm run prepublishOnly
npm pack --dry-run
npm publish
```

## 🔧 Environment Setup

### Required Secrets (for maintainers)

Set these in GitHub repository secrets:

- `NPM_TOKEN`: npm authentication token
- `GITHUB_TOKEN`: automatically provided by GitHub

### Local Development

```bash
# Environment variables for testing
export DATABASE_URL="postgres://user:pass@localhost:5432/test"
export TEST_SCHEMA="public"
export OUTPUT_DIR="./test-output"
```

## 🐛 Bug Reports

When reporting bugs, include:

- Tablerizer version: `tablerizer --version`
- Node.js version: `node --version`
- Operating system
- Database version (if applicable)
- Configuration used (redact sensitive data)
- Error message and stack trace

## 💡 Feature Requests

- Check existing issues first
- Provide clear use case and benefits
- Include examples of expected behavior
- Consider backward compatibility

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.
