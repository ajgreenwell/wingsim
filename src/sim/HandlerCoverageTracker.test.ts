/**
 * Unit tests for HandlerCoverageTracker.
 *
 * These tests verify the tracking, querying, and reporting functionality
 * of the coverage tracker used for Monte Carlo simulation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HandlerCoverageTracker } from "./HandlerCoverageTracker.js";
import {
  ALL_HANDLER_IDS,
  POWER_HANDLER_IDS,
  TURN_ACTION_HANDLER_IDS,
} from "../engine/__integration__/coverage.js";

describe("HandlerCoverageTracker", () => {
  let tracker: HandlerCoverageTracker;

  beforeEach(() => {
    tracker = new HandlerCoverageTracker();
  });

  describe("constructor", () => {
    // Verifies that a fresh tracker starts with zero coverage, which is essential
    // for accurate simulation tracking.
    it("should initialize with zero coverage", () => {
      expect(tracker.getCoveragePercentage()).toBe(0);
      expect(tracker.getCoveredCount()).toBe(0);
      expect(tracker.getUncoveredHandlers().length).toBe(ALL_HANDLER_IDS.length);
    });

    // Confirms the tracker knows about all 42 handlers in the codebase.
    it("should track all known handlers", () => {
      expect(tracker.getTotalCount()).toBe(ALL_HANDLER_IDS.length);
      expect(tracker.getTotalCount()).toBe(42); // 38 power + 4 turn action
    });
  });

  describe("recordInvocation", () => {
    // Tests basic invocation recording - the core function of the tracker.
    it("should record power handler invocations", () => {
      tracker.recordInvocation("gainFoodFromSupply", "power");

      const coverage = tracker.getCoverage();
      const entry = coverage.find((c) => c.handlerId === "gainFoodFromSupply");

      expect(entry).toBeDefined();
      expect(entry?.count).toBe(1);
      expect(entry?.type).toBe("power");
    });

    // Verifies turn action handlers are tracked correctly.
    it("should record turn action handler invocations", () => {
      tracker.recordInvocation("playBirdHandler", "turnAction");

      const coverage = tracker.getCoverage();
      const entry = coverage.find((c) => c.handlerId === "playBirdHandler");

      expect(entry).toBeDefined();
      expect(entry?.count).toBe(1);
      expect(entry?.type).toBe("turnAction");
    });

    // Ensures repeated invocations are counted correctly for coverage analysis.
    it("should increment count on repeated invocations", () => {
      tracker.recordInvocation("tuckAndDraw", "power");
      tracker.recordInvocation("tuckAndDraw", "power");
      tracker.recordInvocation("tuckAndDraw", "power");

      const coverage = tracker.getCoverage();
      const entry = coverage.find((c) => c.handlerId === "tuckAndDraw");

      expect(entry?.count).toBe(3);
    });

    // Confirms tracking works for handlers not in the known list (future-proofing).
    it("should track unknown handler IDs without error", () => {
      // This allows tracking handlers that might be added in the future
      tracker.recordInvocation("unknownHandler", "power");

      // Unknown handlers get tracked but won't affect coverage percentage
      expect(tracker.getCoveragePercentage()).toBe(0);
    });
  });

  describe("getCoverage", () => {
    // Verifies the coverage array includes all tracked handlers.
    it("should return all handler invocations", () => {
      tracker.recordInvocation("gainFoodHandler", "turnAction");
      tracker.recordInvocation("layEggsHandler", "turnAction");

      const coverage = tracker.getCoverage();

      // Should include all 42 handlers (38 power + 4 turn action)
      expect(coverage.length).toBe(ALL_HANDLER_IDS.length);

      // Check specific entries
      const gainFood = coverage.find((c) => c.handlerId === "gainFoodHandler");
      const layEggs = coverage.find((c) => c.handlerId === "layEggsHandler");

      expect(gainFood?.count).toBe(1);
      expect(layEggs?.count).toBe(1);
    });
  });

  describe("getUncoveredHandlers", () => {
    // Tests the uncovered handlers query with no invocations.
    it("should return all handlers when none invoked", () => {
      const uncovered = tracker.getUncoveredHandlers();
      expect(uncovered.length).toBe(ALL_HANDLER_IDS.length);
    });

    // Verifies invoked handlers are removed from the uncovered list.
    it("should exclude invoked handlers", () => {
      tracker.recordInvocation("gainFoodFromSupply", "power");
      tracker.recordInvocation("playBirdHandler", "turnAction");

      const uncovered = tracker.getUncoveredHandlers();

      expect(uncovered).not.toContain("gainFoodFromSupply");
      expect(uncovered).not.toContain("playBirdHandler");
      expect(uncovered.length).toBe(ALL_HANDLER_IDS.length - 2);
    });

    // Confirms empty list when all handlers are covered.
    it("should return empty array when all handlers covered", () => {
      // Invoke all handlers
      for (const id of POWER_HANDLER_IDS) {
        tracker.recordInvocation(id, "power");
      }
      for (const id of TURN_ACTION_HANDLER_IDS) {
        tracker.recordInvocation(id, "turnAction");
      }

      expect(tracker.getUncoveredHandlers()).toEqual([]);
    });
  });

  describe("getCoveragePercentage", () => {
    // Tests percentage calculation with partial coverage.
    it("should calculate correct percentage", () => {
      // Cover 10 handlers out of 42
      const handlersToInvoke = ALL_HANDLER_IDS.slice(0, 10);
      for (const id of handlersToInvoke) {
        tracker.recordInvocation(id, "power");
      }

      const percentage = tracker.getCoveragePercentage();
      expect(percentage).toBeCloseTo((10 / 42) * 100, 1);
    });

    // Verifies 100% coverage when all handlers invoked.
    it("should return 100 when all handlers covered", () => {
      for (const id of POWER_HANDLER_IDS) {
        tracker.recordInvocation(id, "power");
      }
      for (const id of TURN_ACTION_HANDLER_IDS) {
        tracker.recordInvocation(id, "turnAction");
      }

      expect(tracker.getCoveragePercentage()).toBe(100);
    });
  });

  describe("reset", () => {
    // Tests that reset clears all counts, essential for running multiple simulation batches.
    it("should clear all invocation counts", () => {
      tracker.recordInvocation("gainFoodFromSupply", "power");
      tracker.recordInvocation("playBirdHandler", "turnAction");
      expect(tracker.getCoveredCount()).toBe(2);

      tracker.reset();

      expect(tracker.getCoveredCount()).toBe(0);
      expect(tracker.getCoveragePercentage()).toBe(0);
      expect(tracker.getUncoveredHandlers().length).toBe(ALL_HANDLER_IDS.length);
    });

    // Confirms reset allows fresh tracking after reset.
    it("should allow fresh tracking after reset", () => {
      tracker.recordInvocation("gainFoodFromSupply", "power");
      tracker.reset();
      tracker.recordInvocation("tuckAndDraw", "power");

      const coverage = tracker.getCoverage();
      const gainFood = coverage.find((c) => c.handlerId === "gainFoodFromSupply");
      const tuckAndDraw = coverage.find((c) => c.handlerId === "tuckAndDraw");

      expect(gainFood?.count).toBe(0);
      expect(tuckAndDraw?.count).toBe(1);
    });
  });

  describe("generateReport", () => {
    // Verifies the report includes essential coverage statistics.
    it("should include coverage statistics", () => {
      tracker.recordInvocation("gainFoodHandler", "turnAction");
      tracker.recordInvocation("layEggsHandler", "turnAction");
      tracker.recordInvocation("drawCardsHandler", "turnAction");

      const report = tracker.generateReport();

      expect(report).toContain("Handler Coverage Report");
      expect(report).toContain("Coverage:");
      expect(report).toContain("3/42");
    });

    // Confirms uncovered handlers are listed in the report.
    it("should list uncovered handlers", () => {
      // Only invoke turn action handlers, leaving power handlers uncovered
      for (const id of TURN_ACTION_HANDLER_IDS) {
        tracker.recordInvocation(id, "turnAction");
      }

      const report = tracker.generateReport();

      expect(report).toContain("Uncovered handlers:");
      expect(report).toContain("gainFoodFromSupply");
    });

    // Tests the invocation count display in the report.
    it("should show most invoked handlers", () => {
      // Invoke same handler multiple times
      for (let i = 0; i < 50; i++) {
        tracker.recordInvocation("gainFoodFromSupply", "power");
      }

      const report = tracker.generateReport();

      expect(report).toContain("Most invoked handlers:");
      expect(report).toContain("gainFoodFromSupply: 50 times");
    });
  });

  describe("getCoveredCount and getTotalCount", () => {
    // Tests the count accessors for summary statistics.
    it("should return correct counts", () => {
      expect(tracker.getCoveredCount()).toBe(0);
      expect(tracker.getTotalCount()).toBe(42);

      tracker.recordInvocation("gainFoodFromSupply", "power");
      tracker.recordInvocation("playBirdHandler", "turnAction");

      expect(tracker.getCoveredCount()).toBe(2);
      expect(tracker.getTotalCount()).toBe(42);
    });
  });
});
