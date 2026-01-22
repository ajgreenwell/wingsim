/**
 * Coverage tracking utility for scenario tests.
 *
 * This module tracks which handlers are covered by scenario tests by scanning
 * test files for `targetHandlers` declarations and comparing against the
 * complete list of handlers.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * All power handler IDs in the codebase (38 total).
 * These are WHEN_ACTIVATED, WHEN_PLAYED, and ONCE_BETWEEN_TURNS powers.
 */
export const POWER_HANDLER_IDS = [
  "gainFoodFromSupply",
  "cacheFoodFromSupply",
  "gainFoodFromFeederWithCache",
  "whenOpponentLaysEggsLayEggOnNestType",
  "playersWithFewestInHabitatDrawCard",
  "playersWithFewestInHabitatGainFood",
  "tuckAndDraw",
  "discardEggToGainFood",
  "discardEggToDrawCards",
  "rollDiceAndCacheIfMatch",
  "drawAndDistributeCards",
  "gainFoodFromFeeder",
  "discardFoodToTuckFromDeck",
  "eachPlayerGainsFoodFromFeeder",
  "layEggOnBirdsWithNestType",
  "drawBonusCardsAndKeep",
  "layEggsOnBird",
  "gainAllFoodTypeFromFeeder",
  "allPlayersGainFoodFromSupply",
  "lookAtCardAndTuckIfWingspanUnder",
  "whenOpponentPlaysBirdInHabitatGainFood",
  "whenOpponentPlaysBirdInHabitatTuckCard",
  "tuckFromHandAndLay",
  "tuckAndGainFood",
  "tuckAndGainFoodOfChoice",
  "whenOpponentPredatorSucceedsGainFood",
  "whenOpponentGainsFoodCacheIfMatch",
  "moveToAnotherHabitatIfRightmost",
  "drawCardsWithDelayedDiscard",
  "drawCards",
  "drawFaceUpCardsFromTray",
  "allPlayersDrawCardsFromDeck",
  "allPlayersLayEggOnNestType",
  "playAdditionalBirdInHabitat",
  "tradeFoodType",
  "gainFoodFromFeederIfAvailable",
  "repeatBrownPowerInHabitat",
  "repeatPredatorPowerInHabitat",
] as const;

/**
 * All turn action handler IDs in the codebase (4 total).
 */
export const TURN_ACTION_HANDLER_IDS = [
  "gainFoodHandler",
  "layEggsHandler",
  "drawCardsHandler",
  "playBirdHandler",
] as const;

/**
 * All handler IDs combined (42 total).
 */
export const ALL_HANDLER_IDS = [
  ...POWER_HANDLER_IDS,
  ...TURN_ACTION_HANDLER_IDS,
] as const;

export type PowerHandlerId = (typeof POWER_HANDLER_IDS)[number];
export type TurnActionHandlerId = (typeof TURN_ACTION_HANDLER_IDS)[number];
export type HandlerId = (typeof ALL_HANDLER_IDS)[number];

/**
 * Result of scanning a single test file for targetHandlers.
 */
export interface FileHandlerCoverage {
  /** Path to the test file */
  filePath: string;
  /** Handler IDs declared in targetHandlers across all scenarios */
  handlers: Set<string>;
}

/**
 * Overall coverage report.
 */
export interface CoverageReport {
  /** Total number of handlers */
  totalHandlers: number;
  /** Number of covered handlers */
  coveredHandlers: number;
  /** Coverage percentage (0-100) */
  coveragePercent: number;
  /** List of covered handler IDs */
  covered: string[];
  /** List of uncovered handler IDs */
  uncovered: string[];
  /** Coverage breakdown by file */
  byFile: FileHandlerCoverage[];
}

/**
 * Recursively find all .test.ts files in a directory.
 */
function findTestFiles(dir: string): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        results.push(...findTestFiles(fullPath));
      } else if (entry.endsWith(".test.ts")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return results;
}

/**
 * Extract targetHandlers declarations from a test file.
 *
 * Matches patterns like:
 * - targetHandlers: ["handler1", "handler2"]
 * - targetHandlers: ["handler1"],
 */
function extractTargetHandlers(fileContent: string): Set<string> {
  const handlers = new Set<string>();

  // Match targetHandlers: [...] patterns
  const regex = /targetHandlers:\s*\[([\s\S]*?)\]/g;
  let match;

  while ((match = regex.exec(fileContent)) !== null) {
    const arrayContent = match[1];
    // Extract individual handler strings
    const handlerRegex = /"([^"]+)"/g;
    let handlerMatch;
    while ((handlerMatch = handlerRegex.exec(arrayContent)) !== null) {
      handlers.add(handlerMatch[1]);
    }
  }

  return handlers;
}

/**
 * Scan scenario test files and extract targetHandlers.
 *
 * @param scenariosDir - Directory containing scenario test files
 * @returns Array of file coverage results
 */
export function scanScenarioFiles(scenariosDir: string): FileHandlerCoverage[] {
  const testFiles = findTestFiles(scenariosDir);
  const results: FileHandlerCoverage[] = [];

  for (const filePath of testFiles) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const handlers = extractTargetHandlers(content);

      if (handlers.size > 0) {
        results.push({
          filePath,
          handlers,
        });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

/**
 * Compute coverage statistics from scanned files.
 *
 * @param fileCoverages - Results from scanScenarioFiles
 * @param allHandlers - Complete list of handler IDs to check coverage for
 * @returns Coverage report with statistics
 */
export function computeCoverage(
  fileCoverages: FileHandlerCoverage[],
  allHandlers: readonly string[] = ALL_HANDLER_IDS
): CoverageReport {
  // Collect all covered handlers across all files
  const coveredSet = new Set<string>();
  for (const file of fileCoverages) {
    for (const handler of file.handlers) {
      if (allHandlers.includes(handler)) {
        coveredSet.add(handler);
      }
    }
  }

  const covered = [...coveredSet].sort();
  const uncovered = allHandlers.filter((h) => !coveredSet.has(h)).sort();

  return {
    totalHandlers: allHandlers.length,
    coveredHandlers: covered.length,
    coveragePercent: Math.round((covered.length / allHandlers.length) * 100),
    covered,
    uncovered,
    byFile: fileCoverages,
  };
}

/**
 * Format coverage report for console output.
 */
export function formatCoverageReport(
  report: CoverageReport,
  baseDir?: string
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("                    HANDLER COVERAGE REPORT");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("");

  // Summary
  lines.push(`Coverage: ${report.coveredHandlers}/${report.totalHandlers} handlers (${report.coveragePercent}%)`);
  lines.push("");

  // Progress bar
  const barWidth = 50;
  const filledWidth = Math.round((report.coveragePercent / 100) * barWidth);
  const bar = "█".repeat(filledWidth) + "░".repeat(barWidth - filledWidth);
  lines.push(`[${bar}] ${report.coveragePercent}%`);
  lines.push("");

  // Covered handlers
  if (report.covered.length > 0) {
    lines.push("✓ COVERED HANDLERS:");
    for (const handler of report.covered) {
      lines.push(`  • ${handler}`);
    }
    lines.push("");
  }

  // Uncovered handlers
  if (report.uncovered.length > 0) {
    lines.push("✗ UNCOVERED HANDLERS:");
    for (const handler of report.uncovered) {
      lines.push(`  • ${handler}`);
    }
    lines.push("");
  }

  // Coverage by file
  if (report.byFile.length > 0) {
    lines.push("─────────────────────────────────────────────────────────────────");
    lines.push("COVERAGE BY FILE:");
    lines.push("─────────────────────────────────────────────────────────────────");

    for (const file of report.byFile) {
      const displayPath = baseDir ? relative(baseDir, file.filePath) : file.filePath;
      lines.push(`\n${displayPath}:`);
      for (const handler of [...file.handlers].sort()) {
        lines.push(`  • ${handler}`);
      }
    }
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════════════");

  return lines.join("\n");
}

/**
 * Generate and print a coverage report for the scenarios directory.
 *
 * @param scenariosDir - Directory containing scenario test files
 * @param options - Options for report generation
 */
export function generateCoverageReport(
  scenariosDir: string,
  options: { printToConsole?: boolean } = {}
): CoverageReport {
  const fileCoverages = scanScenarioFiles(scenariosDir);
  const report = computeCoverage(fileCoverages);

  if (options.printToConsole !== false) {
    console.log(formatCoverageReport(report, scenariosDir));
  }

  return report;
}
