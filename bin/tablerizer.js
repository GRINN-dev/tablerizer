#!/usr/bin/env node

/**
 * Tablerizer CLI Binary
 *
 * This is the command-line interface for the Tablerizer PostgreSQL export wizard.
 * It connects the compiled library to command-line usage.
 */

import { runCLI } from "../lib/cli.js";

// Run the CLI with proper error handling
runCLI().catch((error) => {
  console.error("💥 Spell failed:", error.message);
  process.exit(1);
});
