import { escapeIdent } from "./utils.js";

/**
 * Generate trigger statements:
 *   DROP TRIGGER IF EXISTS ...;
 *   CREATE TRIGGER ...;
 *
 * Triggers grouped by name (multi-event), sorted alphabetically.
 */
export function generateTriggersSQL(
  schema: string,
  tableName: string,
  triggers: Array<{
    trigger_name: string;
    action_timing: string;
    event_manipulation: string;
    action_orientation: string;
    action_statement: string;
    action_condition: string | null;
    action_order: number;
  }>,
): string[] {
  if (triggers.length === 0) return [];

  const sqlStatements: string[] = [];

  // Group triggers by name, timing, orientation, statement, and condition
  const triggerGroups = new Map<
    string,
    {
      trigger_name: string;
      action_timing: string;
      events: string[];
      action_orientation: string;
      action_statement: string;
      action_condition: string | null;
      action_order: number;
    }
  >();

  for (const trigger of triggers) {
    const groupKey = `${trigger.trigger_name}|${trigger.action_timing}|${trigger.action_orientation}|${trigger.action_statement}|${trigger.action_condition || ""}`;

    if (triggerGroups.has(groupKey)) {
      triggerGroups.get(groupKey)!.events.push(trigger.event_manipulation);
    } else {
      triggerGroups.set(groupKey, {
        trigger_name: trigger.trigger_name,
        action_timing: trigger.action_timing,
        events: [trigger.event_manipulation],
        action_orientation: trigger.action_orientation,
        action_statement: trigger.action_statement,
        action_condition: trigger.action_condition,
        action_order: trigger.action_order,
      });
    }
  }

  // Generate SQL for each trigger group (sorted alphabetically by trigger name)
  const sortedTriggers = Array.from(triggerGroups.values()).sort((a, b) =>
    a.trigger_name.localeCompare(b.trigger_name),
  );

  for (const triggerGroup of sortedTriggers) {
    const escapedTriggerName = escapeIdent(triggerGroup.trigger_name);

    // Drop first for idempotency
    sqlStatements.push(
      `DROP TRIGGER IF EXISTS ${escapedTriggerName} ON ${schema}.${tableName};`,
    );

    // Sort events for consistent output
    const sortedEvents = [...triggerGroup.events].sort();
    const eventString = sortedEvents.join(" OR ");

    let sql = `CREATE TRIGGER ${escapedTriggerName}`;
    sql += ` ${triggerGroup.action_timing} ${eventString}`;
    sql += ` ON ${schema}.${tableName}`;
    sql += ` FOR EACH ${triggerGroup.action_orientation}`;

    if (triggerGroup.action_condition) {
      sql += ` WHEN (${triggerGroup.action_condition})`;
    }

    sql += ` ${triggerGroup.action_statement};`;
    sqlStatements.push(sql);
  }

  return sqlStatements;
}
