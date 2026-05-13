import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateTriggersSQL } from "../../src/generators/index.js";
import { join } from "./fixtures.js";

describe("generateTriggersSQL", () => {
  const triggers = [
    { trigger_name: "trg_b", action_timing: "AFTER", event_manipulation: "DELETE", action_orientation: "ROW", action_statement: "EXECUTE FUNCTION fn()", action_condition: null, action_order: 1 },
    { trigger_name: "trg_a", action_timing: "BEFORE", event_manipulation: "UPDATE", action_orientation: "ROW", action_statement: "EXECUTE FUNCTION fn()", action_condition: null, action_order: 1 },
    { trigger_name: "trg_a", action_timing: "BEFORE", event_manipulation: "INSERT", action_orientation: "ROW", action_statement: "EXECUTE FUNCTION fn()", action_condition: null, action_order: 1 },
  ];

  it("should group multi-event triggers and sort events alphabetically", () => {
    const result = join(generateTriggersSQL("s", "t", triggers));
    // trg_a has INSERT + UPDATE → sorted as INSERT OR UPDATE
    assert.match(result, /BEFORE INSERT OR UPDATE/);
  });

  it("should sort triggers alphabetically by name", () => {
    const result = join(generateTriggersSQL("s", "t", triggers));
    const posA = result.indexOf("trg_a");
    const posB = result.indexOf("trg_b");
    assert.ok(posA < posB);
  });

  it("should emit DROP TRIGGER IF EXISTS before each CREATE TRIGGER", () => {
    const result = join(generateTriggersSQL("s", "t", triggers));
    const dropA = result.indexOf("DROP TRIGGER IF EXISTS trg_a");
    const createA = result.indexOf("CREATE TRIGGER trg_a");
    assert.ok(dropA >= 0 && createA >= 0 && dropA < createA);
  });

  it("should include WHEN clause if action_condition is set", () => {
    const withCond = [
      { trigger_name: "trg", action_timing: "BEFORE", event_manipulation: "UPDATE", action_orientation: "ROW", action_statement: "EXECUTE FUNCTION fn()", action_condition: "OLD.x IS DISTINCT FROM NEW.x", action_order: 1 },
    ];
    const result = join(generateTriggersSQL("s", "t", withCond));
    assert.match(result, /WHEN \(OLD\.x IS DISTINCT FROM NEW\.x\)/);
  });

  it("should group correctly when action_condition contains pipe characters", () => {
    const withPipe = [
      { trigger_name: "trg", action_timing: "BEFORE", event_manipulation: "INSERT", action_orientation: "ROW", action_statement: "EXECUTE FUNCTION fn()", action_condition: "NEW.status = 'a|b'", action_order: 1 },
      { trigger_name: "trg", action_timing: "BEFORE", event_manipulation: "UPDATE", action_orientation: "ROW", action_statement: "EXECUTE FUNCTION fn()", action_condition: "NEW.status = 'a|b'", action_order: 1 },
    ];
    const result = join(generateTriggersSQL("s", "t", withPipe));
    assert.match(result, /BEFORE INSERT OR UPDATE/);
    assert.equal(result.match(/CREATE TRIGGER/g)?.length, 1, "should produce exactly one CREATE TRIGGER");
  });
});
