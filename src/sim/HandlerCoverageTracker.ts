/**
 * HandlerCoverageTracker - Tracks which handlers have been invoked during simulation runs.
 *
 * This tracker is used by the Simulator to monitor handler coverage across games.
 * It maintains counts of invocations for each handler and can generate reports
 * showing coverage statistics.
 *
 * The tracker is designed to be passed to ActionProcessor via callback injection,
 * allowing it to record invocations without coupling the engine to simulation code.
 */

import {
  POWER_HANDLER_IDS,
  TURN_ACTION_HANDLER_IDS,
  ALL_HANDLER_IDS,
} from "../engine/__integration__/coverage.js";

export type HandlerType = "power" | "turnAction";

export interface HandlerInvocation {
  handlerId: string;
  type: HandlerType;
  count: number;
}

/**
 * Maps handler IDs to their type for quick lookup.
 */
const HANDLER_TYPE_MAP: Map<string, HandlerType> = new Map([
  ...POWER_HANDLER_IDS.map((id) => [id, "power" as HandlerType] as const),
  ...TURN_ACTION_HANDLER_IDS.map(
    (id) => [id, "turnAction" as HandlerType] as const
  ),
]);

export class HandlerCoverageTracker {
  private readonly invocationCounts: Map<string, number> = new Map();

  constructor() {
    // Initialize all handlers with zero counts
    for (const handlerId of ALL_HANDLER_IDS) {
      this.invocationCounts.set(handlerId, 0);
    }
  }

  /**
   * Record a handler invocation. Called by instrumented ActionProcessor.
   *
   * @param handlerId - The ID of the handler that was invoked
   * @param type - The type of handler ("power" or "turnAction")
   */
  recordInvocation(handlerId: string, type: HandlerType): void {
    const currentCount = this.invocationCounts.get(handlerId) ?? 0;
    this.invocationCounts.set(handlerId, currentCount + 1);

    // Validate type matches expected (helps catch bugs in integration)
    const expectedType = HANDLER_TYPE_MAP.get(handlerId);
    if (expectedType && expectedType !== type) {
      console.warn(
        `HandlerCoverageTracker: Handler ${handlerId} reported as ${type} but expected ${expectedType}`
      );
    }
  }

  /**
   * Get all handler invocations with their counts.
   */
  getCoverage(): HandlerInvocation[] {
    const invocations: HandlerInvocation[] = [];

    for (const [handlerId, count] of this.invocationCounts) {
      const type = HANDLER_TYPE_MAP.get(handlerId);
      if (type) {
        invocations.push({ handlerId, type, count });
      }
    }

    return invocations;
  }

  /**
   * Get handler IDs that have not been invoked.
   */
  getUncoveredHandlers(): string[] {
    return ALL_HANDLER_IDS.filter(
      (id) => (this.invocationCounts.get(id) ?? 0) === 0
    );
  }

  /**
   * Get the percentage of handlers that have been invoked at least once.
   */
  getCoveragePercentage(): number {
    const coveredCount = ALL_HANDLER_IDS.filter(
      (id) => (this.invocationCounts.get(id) ?? 0) > 0
    ).length;

    return (coveredCount / ALL_HANDLER_IDS.length) * 100;
  }

  /**
   * Get the count of handlers that have been invoked at least once.
   */
  getCoveredCount(): number {
    return ALL_HANDLER_IDS.filter(
      (id) => (this.invocationCounts.get(id) ?? 0) > 0
    ).length;
  }

  /**
   * Get the total number of handlers being tracked.
   */
  getTotalCount(): number {
    return ALL_HANDLER_IDS.length;
  }

  /**
   * Reset all invocation counts to zero. Used to start a new simulation batch.
   */
  reset(): void {
    for (const handlerId of ALL_HANDLER_IDS) {
      this.invocationCounts.set(handlerId, 0);
    }
  }

  /**
   * Generate a human-readable coverage report for CLI output.
   */
  generateReport(): string {
    const lines: string[] = [];
    const coverage = this.getCoverage();
    const uncovered = this.getUncoveredHandlers();
    const percentage = this.getCoveragePercentage();
    const coveredCount = this.getCoveredCount();
    const totalCount = this.getTotalCount();

    lines.push("");
    lines.push("Handler Coverage Report");
    lines.push("-----------------------");
    lines.push(`  Coverage: ${coveredCount}/${totalCount} (${percentage.toFixed(1)}%)`);
    lines.push("");

    // Progress bar
    const barWidth = 40;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const bar = "█".repeat(filledWidth) + "░".repeat(barWidth - filledWidth);
    lines.push(`  [${bar}] ${percentage.toFixed(1)}%`);
    lines.push("");

    // Uncovered handlers (if any)
    if (uncovered.length > 0) {
      lines.push("  Uncovered handlers:");
      for (const handlerId of uncovered) {
        const type = HANDLER_TYPE_MAP.get(handlerId) ?? "unknown";
        lines.push(`    - ${handlerId} (${type})`);
      }
      lines.push("");
    }

    // Most invoked handlers (top 10)
    const sortedByCount = [...coverage]
      .filter((inv) => inv.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    if (sortedByCount.length > 0) {
      lines.push("  Most invoked handlers:");
      for (const inv of sortedByCount) {
        lines.push(`    - ${inv.handlerId}: ${inv.count} times`);
      }
    }

    return lines.join("\n");
  }
}
