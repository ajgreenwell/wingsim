#!/usr/bin/env node
/**
 * Script to run scenario tests with optional coverage reporting.
 *
 * Usage:
 *   yarn test:scenario                    # Run all scenario tests
 *   yarn test:scenario --coverage         # Run all scenario tests + print coverage
 *   yarn test:scenario path/to/test.ts    # Run specific test file(s)
 *   yarn test:scenario path/*.test.ts --coverage  # Run specific tests + coverage
 */

import { spawn } from "child_process";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

// Get the directory of this script and the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

// Parse arguments
const args = process.argv.slice(2);
const showCoverage = args.includes("--coverage");
const testPaths = args.filter((arg) => !arg.startsWith("--"));

// Default scenarios directory
const scenariosDir = join(
  projectRoot,
  "src/engine/__integration__/scenarios"
);

// Build vitest arguments
const vitestArgs = ["run"];

if (testPaths.length > 0) {
  // Run specific test files
  vitestArgs.push(...testPaths);
} else {
  // Run all scenario tests (in scenarios directory)
  vitestArgs.push(scenariosDir);
}

// Run vitest
const vitest = spawn("npx", ["vitest", ...vitestArgs], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: true,
});

vitest.on("close", async (code) => {
  // If --coverage flag was passed, generate and print coverage report
  if (showCoverage) {
    console.log("\n");

    // Dynamically import coverage module (after tests run)
    try {
      const { generateCoverageReport } = await import(
        "../src/engine/__integration__/coverage.js"
      );
      generateCoverageReport(scenariosDir);
    } catch (error) {
      console.error("Error generating coverage report:", error);
      // Try to generate report using tsx for TypeScript support
      const tsx = spawn(
        "npx",
        [
          "tsx",
          "-e",
          `
          import { generateCoverageReport } from './src/engine/__integration__/coverage.ts';
          generateCoverageReport('${scenariosDir.replace(/\\/g, "\\\\")}');
        `,
        ],
        {
          cwd: projectRoot,
          stdio: "inherit",
          shell: true,
        }
      );

      tsx.on("close", (coverageCode) => {
        process.exit(code || coverageCode || 0);
      });
      return;
    }
  }

  process.exit(code || 0);
});
