# Centralize configuration resolution into a single pipeline

Configuration is currently scattered across three files (`config.ts`, `cli.ts`, `tablerizer.ts`) with implicit precedence rules (file → env → CLI). Defaults live in multiple places, special cases are buried in implementation (e.g., env var expansion in `role_mappings` keys), and the whole thing is untestable in isolation.

We're consolidating into a single config module with an explicit pipeline: parse each source independently, then merge with declared precedence. This creates a real seam where a future interactive CLI wizard can sit as an adapter alongside the current file/env/CLI sources.

## Considered options

- **Keep the current approach and just add tests** — rejected because the logic is spread across files with shared mutable state; testing would require mocking three different input sources with no clear contract between them.
- **Use a config library (cosmiconfig, rc, etc.)** — rejected because the role-mapping env var expansion and Graphile Migrate placeholder syntax are specific enough that a generic library would need as much glue code as a purpose-built solution.
