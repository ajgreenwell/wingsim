#!/usr/bin/env node

/**
 * CLI Entry Point for the Monte Carlo Simulator.
 *
 * Provides command-line interface for running game simulations with
 * configurable agents, seeds, and coverage tracking.
 *
 * Usage: yarn sim [options]
 */

import { Command } from "commander";
import { Simulator, type SimulatorConfig } from "./Simulator.js";
import { AgentRegistry } from "../agents/AgentRegistry.js";

// Ensure SmartRandomAgent is registered
import "../agents/SmartRandomAgent.js";

const VERSION = "0.1.0";
const DEFAULT_NUM_GAMES = 10;
const DEFAULT_NUM_PLAYERS = 2;
const DEFAULT_AGENT = "SmartRandomAgent";

/**
 * Format milliseconds as human-readable duration.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Parse comma-separated seeds from CLI argument.
 */
function parseSeeds(value: string): number[] {
  return value.split(",").map((s) => {
    const parsed = parseInt(s.trim(), 10);
    if (isNaN(parsed)) {
      throw new Error(`Invalid seed value: "${s}"`);
    }
    return parsed;
  });
}

/**
 * Build agent types array from CLI options.
 */
function buildAgentTypes(
  numPlayers: number,
  options: Record<string, string | undefined>
): string[] {
  const agentTypes: string[] = [];

  for (let i = 1; i <= numPlayers; i++) {
    const playerOption = options[`player${i}`] as string | undefined;
    agentTypes.push(playerOption ?? DEFAULT_AGENT);
  }

  return agentTypes;
}

/**
 * Print simulation configuration.
 */
function printConfig(
  numGames: number,
  numPlayers: number,
  agentTypes: string[],
  baseSeed: number | undefined,
  explicitSeeds: number[] | undefined
): void {
  console.log("");
  console.log(`Wingspan Simulator v${VERSION}`);
  console.log("========================");
  console.log("");
  console.log("Configuration:");
  console.log(`  Games: ${numGames}`);
  console.log(`  Players: ${numPlayers}`);
  console.log(`  Agents: ${agentTypes.join(", ")}`);

  if (explicitSeeds) {
    console.log(`  Seeds: ${explicitSeeds.join(", ")} (explicit)`);
  } else if (baseSeed !== undefined) {
    console.log(`  Base seed: ${baseSeed}`);
  } else {
    console.log(`  Base seed: (auto-generated)`);
  }

  console.log("");
}

/**
 * Print per-game result.
 */
function printGameResult(
  gameIndex: number,
  totalGames: number,
  seed: number,
  winnerId: string,
  scores: Map<string, number>,
  durationMs: number
): void {
  const scoreStrings = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([_player, score]) => `${score}`)
    .join("-");

  console.log(
    `  Game ${gameIndex}/${totalGames} [seed: ${seed}] ${winnerId} wins (${scoreStrings}) in ${formatDuration(durationMs)}`
  );
}

/**
 * Print simulation summary.
 */
function printSummary(
  totalDurationMs: number,
  successCount: number,
  totalGames: number,
  winCounts: Map<string, number>,
  seeds: number[]
): void {
  console.log("");
  console.log("Summary");
  console.log("-------");
  console.log(`  Total time: ${formatDuration(totalDurationMs)}`);
  console.log(`  Successful: ${successCount}/${totalGames}`);

  const winDistribution = Array.from(winCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([player, wins]) => `${player}: ${wins}`)
    .join(", ");
  console.log(`  Win distribution: ${winDistribution}`);

  console.log("");
  console.log("Seeds used (for replay):");
  console.log(`  ${seeds.join(", ")}`);
}

/**
 * List available agent types and exit.
 */
function listAgents(): void {
  console.log("");
  console.log("Available Agent Types:");
  console.log("----------------------");

  const agents = AgentRegistry.list();
  if (agents.length === 0) {
    console.log("  (no agents registered)");
  } else {
    for (const agent of agents) {
      console.log(`  ${agent.name}`);
      console.log(`    ${agent.description}`);
    }
  }

  console.log("");
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name("yarn sim")
    .description("Run Wingspan Monte Carlo simulations")
    .version(VERSION)
    .option("-n, --num-games <n>", "Number of games to simulate", String(DEFAULT_NUM_GAMES))
    .option("-p, --players <n>", "Number of players per game (2-5)", String(DEFAULT_NUM_PLAYERS))
    .option("-s, --seed <seed>", "Base seed for reproducibility")
    .option("--seeds <seeds>", "Explicit seeds for each game (comma-separated)")
    .option("--coverage", "Generate handler coverage report", false)
    .option("--player1 <type>", "Agent type for player 1")
    .option("--player2 <type>", "Agent type for player 2")
    .option("--player3 <type>", "Agent type for player 3")
    .option("--player4 <type>", "Agent type for player 4")
    .option("--player5 <type>", "Agent type for player 5")
    .option("--list-agents", "List available agent types", false);

  program.parse(process.argv);
  const options = program.opts();

  // Handle --list-agents
  if (options.listAgents) {
    listAgents();
    process.exit(0);
  }

  // Parse options
  const numPlayers = parseInt(options.players, 10);
  const baseSeed = options.seed ? parseInt(options.seed, 10) : undefined;
  const explicitSeeds = options.seeds ? parseSeeds(options.seeds) : undefined;
  const trackCoverage = options.coverage;

  // Determine number of games - if explicit seeds provided, use their count
  const numGames = explicitSeeds
    ? explicitSeeds.length
    : parseInt(options.numGames, 10);

  // Validate parsed values
  if (isNaN(numGames) || numGames < 1) {
    console.error("Error: --num-games must be a positive integer");
    process.exit(1);
  }

  if (isNaN(numPlayers) || numPlayers < 2 || numPlayers > 5) {
    console.error("Error: --players must be between 2 and 5");
    process.exit(1);
  }

  if (baseSeed !== undefined && isNaN(baseSeed)) {
    console.error("Error: --seed must be a valid integer");
    process.exit(1);
  }

  // Build agent types for each player
  const agentTypes = buildAgentTypes(numPlayers, options);

  // Validate agent types
  for (let i = 0; i < agentTypes.length; i++) {
    if (!AgentRegistry.has(agentTypes[i])) {
      console.error(
        `Error: Agent type "${agentTypes[i]}" for player ${i + 1} not found. ` +
          `Available: ${AgentRegistry.listNames().join(", ")}`
      );
      process.exit(1);
    }
  }

  // Print configuration
  printConfig(numGames, numPlayers, agentTypes, baseSeed, explicitSeeds);

  // Build simulator config
  const config: SimulatorConfig = {
    numGames,
    numPlayers,
    agentTypes,
    baseSeed,
    seeds: explicitSeeds,
    trackCoverage,
  };

  // Create and run simulator
  const simulator = new Simulator(config);

  console.log("Running simulations...");

  const summary = await simulator.run();

  // Print per-game results
  const winCounts = new Map<string, number>();

  for (let i = 0; i < summary.games.length; i++) {
    const game = summary.games[i];
    const winnerId = game.result.winnerId;

    // Track wins
    winCounts.set(winnerId, (winCounts.get(winnerId) ?? 0) + 1);

    // Convert scores to Map for display
    const scoresMap = new Map<string, number>(
      Object.entries(game.result.scores)
    );

    printGameResult(
      i + 1,
      numGames,
      game.seed,
      winnerId,
      scoresMap,
      game.durationMs
    );
  }

  // Print summary
  printSummary(
    summary.totalDurationMs,
    summary.successCount,
    numGames,
    winCounts,
    summary.seeds
  );

  // Print coverage report if enabled
  if (trackCoverage) {
    const tracker = simulator.getCoverageTracker();
    if (tracker) {
      console.log(tracker.generateReport());
    }
  }

  // Exit with error code if any games failed
  if (summary.errorCount > 0) {
    process.exit(1);
  }
}

// Run the CLI
main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
