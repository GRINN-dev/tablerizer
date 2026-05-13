/**
 * Tablerizer v2 Integration Test Suite
 * Entry point that handles global setup/teardown and imports all test files.
 */
import { before, after } from "node:test";
import { globalSetup, globalTeardown } from "./helpers.js";

before(async () => { await globalSetup(); });
after(async () => { await globalTeardown(); });

// Import all test modules (they register their own describe blocks)
import "./integration/connection.test.js";
import "./integration/ddl-structure.test.js";
import "./integration/constraints.test.js";
import "./integration/indexes.test.js";
import "./integration/comments.test.js";
import "./integration/rls.test.js";
import "./integration/grants.test.js";
import "./integration/triggers.test.js";
import "./integration/partitions.test.js";
import "./integration/edge-cases.test.js";
import "./integration/functions.test.js";
import "./integration/materialized-views.test.js";
import "./integration/scoping.test.js";
import "./integration/determinism.test.js";
import "./integration/configuration.test.js";
import "./integration/query-grants.test.js";
