/**
 * Unit tests for the coverage tracking utility.
 *
 * These tests verify that the coverage module correctly:
 * - Exports all expected handler IDs
 * - Extracts targetHandlers from test file content
 * - Computes coverage statistics correctly
 * - Formats reports properly
 */

import { describe, it, expect } from "vitest";
import {
  POWER_HANDLER_IDS,
  TURN_ACTION_HANDLER_IDS,
  ALL_HANDLER_IDS,
  computeCoverage,
  formatCoverageReport,
  type FileHandlerCoverage,
} from "./coverage.js";

describe("coverage constants", () => {
  // Verify we export exactly the expected number of handlers
  it("exports 38 power handler IDs", () => {
    expect(POWER_HANDLER_IDS).toHaveLength(38);
  });

  it("exports 4 turn action handler IDs", () => {
    expect(TURN_ACTION_HANDLER_IDS).toHaveLength(4);
  });

  it("exports 42 total handler IDs", () => {
    expect(ALL_HANDLER_IDS).toHaveLength(42);
  });

  // Verify all handler IDs are unique
  it("all handler IDs are unique", () => {
    const uniqueIds = new Set(ALL_HANDLER_IDS);
    expect(uniqueIds.size).toBe(ALL_HANDLER_IDS.length);
  });

  // Verify turn action handlers follow naming convention
  it("turn action handlers end with 'Handler'", () => {
    for (const handler of TURN_ACTION_HANDLER_IDS) {
      expect(handler).toMatch(/Handler$/);
    }
  });
});

describe("computeCoverage", () => {
  // Test empty coverage scenario
  it("returns 0% coverage when no files have handlers", () => {
    const report = computeCoverage([]);

    expect(report.totalHandlers).toBe(42);
    expect(report.coveredHandlers).toBe(0);
    expect(report.coveragePercent).toBe(0);
    expect(report.covered).toHaveLength(0);
    expect(report.uncovered).toHaveLength(42);
  });

  // Test partial coverage
  it("computes correct coverage for partial coverage", () => {
    const fileCoverages: FileHandlerCoverage[] = [
      {
        filePath: "test1.ts",
        handlers: new Set(["gainFoodHandler", "gainFoodFromSupply"]),
      },
      {
        filePath: "test2.ts",
        handlers: new Set(["layEggsHandler"]),
      },
    ];

    const report = computeCoverage(fileCoverages);

    expect(report.coveredHandlers).toBe(3);
    expect(report.coveragePercent).toBe(7); // 3/42 = 7.14% -> rounds to 7%
    expect(report.covered).toContain("gainFoodHandler");
    expect(report.covered).toContain("gainFoodFromSupply");
    expect(report.covered).toContain("layEggsHandler");
    expect(report.uncovered).not.toContain("gainFoodHandler");
  });

  // Test full coverage
  it("computes 100% coverage when all handlers are covered", () => {
    const fileCoverages: FileHandlerCoverage[] = [
      {
        filePath: "all.ts",
        handlers: new Set([...ALL_HANDLER_IDS]),
      },
    ];

    const report = computeCoverage(fileCoverages);

    expect(report.coveragePercent).toBe(100);
    expect(report.covered).toHaveLength(42);
    expect(report.uncovered).toHaveLength(0);
  });

  // Test deduplication across files
  it("deduplicates handlers across multiple files", () => {
    const fileCoverages: FileHandlerCoverage[] = [
      {
        filePath: "test1.ts",
        handlers: new Set(["gainFoodHandler"]),
      },
      {
        filePath: "test2.ts",
        handlers: new Set(["gainFoodHandler", "layEggsHandler"]),
      },
    ];

    const report = computeCoverage(fileCoverages);

    expect(report.coveredHandlers).toBe(2); // Not 3, gainFoodHandler is deduped
    expect(report.covered).toEqual(["gainFoodHandler", "layEggsHandler"]);
  });

  // Test that unknown handlers are ignored
  it("ignores handlers not in the master list", () => {
    const fileCoverages: FileHandlerCoverage[] = [
      {
        filePath: "test.ts",
        handlers: new Set(["gainFoodHandler", "unknownHandler", "fakeHandler"]),
      },
    ];

    const report = computeCoverage(fileCoverages);

    expect(report.coveredHandlers).toBe(1); // Only gainFoodHandler counts
    expect(report.covered).toEqual(["gainFoodHandler"]);
  });

  // Test custom handler list
  it("accepts custom handler list", () => {
    const customHandlers = ["handler1", "handler2", "handler3"] as const;
    const fileCoverages: FileHandlerCoverage[] = [
      {
        filePath: "test.ts",
        handlers: new Set(["handler1", "handler2"]),
      },
    ];

    const report = computeCoverage(fileCoverages, customHandlers);

    expect(report.totalHandlers).toBe(3);
    expect(report.coveredHandlers).toBe(2);
    expect(report.coveragePercent).toBe(67); // 2/3 = 66.67% -> rounds to 67%
    expect(report.uncovered).toEqual(["handler3"]);
  });
});

describe("formatCoverageReport", () => {
  // Test basic formatting
  it("includes coverage summary", () => {
    const report = computeCoverage([
      {
        filePath: "test.ts",
        handlers: new Set(["gainFoodHandler"]),
      },
    ]);

    const formatted = formatCoverageReport(report);

    expect(formatted).toContain("HANDLER COVERAGE REPORT");
    expect(formatted).toContain("1/42 handlers");
    expect(formatted).toContain("2%");
  });

  // Test covered handlers section
  it("lists covered handlers", () => {
    const report = computeCoverage([
      {
        filePath: "test.ts",
        handlers: new Set(["gainFoodHandler", "layEggsHandler"]),
      },
    ]);

    const formatted = formatCoverageReport(report);

    expect(formatted).toContain("✓ COVERED HANDLERS:");
    expect(formatted).toContain("gainFoodHandler");
    expect(formatted).toContain("layEggsHandler");
  });

  // Test uncovered handlers section
  it("lists uncovered handlers", () => {
    const report = computeCoverage([]);

    const formatted = formatCoverageReport(report);

    expect(formatted).toContain("✗ UNCOVERED HANDLERS:");
    expect(formatted).toContain("gainFoodHandler");
    expect(formatted).toContain("playBirdHandler");
  });

  // Test file breakdown
  it("shows coverage by file", () => {
    const report = computeCoverage([
      {
        filePath: "/path/to/test.ts",
        handlers: new Set(["gainFoodHandler"]),
      },
    ]);

    const formatted = formatCoverageReport(report);

    expect(formatted).toContain("COVERAGE BY FILE:");
    expect(formatted).toContain("/path/to/test.ts");
  });

  // Test relative path display
  it("shows relative paths when baseDir provided", () => {
    const report = computeCoverage([
      {
        filePath: "/project/src/engine/__integration__/scenarios/test.ts",
        handlers: new Set(["gainFoodHandler"]),
      },
    ]);

    const formatted = formatCoverageReport(
      report,
      "/project/src/engine/__integration__/scenarios"
    );

    expect(formatted).toContain("test.ts");
    expect(formatted).not.toContain("/project/src/engine");
  });
});
