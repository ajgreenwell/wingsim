/**
 * Tests for the Simulator class.
 *
 * These tests verify that the Simulator correctly orchestrates game simulations,
 * manages seeds for reproducibility, and tracks handler coverage.
 */

import { describe, it, expect } from "vitest";
import { Simulator, type SimulatorConfig } from "./Simulator.js";

// Ensure SmartRandomAgent is registered
import "../agents/SmartRandomAgent.js";

describe("Simulator", () => {
  // Verifies configuration validation catches invalid numGames
  it("rejects numGames < 1", () => {
    expect(
      () =>
        new Simulator({
          numGames: 0,
          numPlayers: 2,
          agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
          trackCoverage: false,
        })
    ).toThrow("numGames must be at least 1");
  });

  // Verifies configuration validation catches invalid numPlayers
  it("rejects numPlayers outside 2-5 range", () => {
    expect(
      () =>
        new Simulator({
          numGames: 1,
          numPlayers: 1,
          agentTypes: ["SmartRandomAgent"],
          trackCoverage: false,
        })
    ).toThrow("numPlayers must be between 2 and 5");

    expect(
      () =>
        new Simulator({
          numGames: 1,
          numPlayers: 6,
          agentTypes: Array(6).fill("SmartRandomAgent"),
          trackCoverage: false,
        })
    ).toThrow("numPlayers must be between 2 and 5");
  });

  // Verifies agentTypes length must match numPlayers
  it("rejects mismatched agentTypes length", () => {
    expect(
      () =>
        new Simulator({
          numGames: 1,
          numPlayers: 3,
          agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
          trackCoverage: false,
        })
    ).toThrow("agentTypes length (2) must equal numPlayers (3)");
  });

  // Verifies unknown agent types are rejected
  it("rejects unknown agent types", () => {
    expect(
      () =>
        new Simulator({
          numGames: 1,
          numPlayers: 2,
          agentTypes: ["SmartRandomAgent", "UnknownAgent"],
          trackCoverage: false,
        })
    ).toThrow('Agent type "UnknownAgent" not found');
  });

  // Verifies explicit seeds length must match numGames
  it("rejects mismatched explicit seeds length", () => {
    expect(
      () =>
        new Simulator({
          numGames: 3,
          numPlayers: 2,
          agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
          seeds: [1, 2],
          trackCoverage: false,
        })
    ).toThrow("seeds length (2) must equal numGames (3)");
  });

  // Verifies valid configuration is accepted
  it("accepts valid configuration", () => {
    const simulator = new Simulator({
      numGames: 1,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      trackCoverage: false,
    });
    expect(simulator).toBeDefined();
  });

  // Verifies simulator runs a single game successfully
  it("runs a single game successfully", async () => {
    const simulator = new Simulator({
      numGames: 1,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      baseSeed: 12345,
      trackCoverage: false,
    });

    const summary = await simulator.run();

    expect(summary.games.length).toBe(1);
    expect(summary.successCount).toBe(1);
    expect(summary.errorCount).toBe(0);
    expect(summary.seeds.length).toBe(1);
    expect(summary.totalDurationMs).toBeGreaterThan(0);

    const game = summary.games[0];
    expect(game.result.winnerId).toBeDefined();
    expect(Object.keys(game.result.scores).length).toBe(2);
    expect(game.durationMs).toBeGreaterThan(0);
  }, 30000);

  // Verifies simulator runs multiple games
  it("runs multiple games", async () => {
    const simulator = new Simulator({
      numGames: 3,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      baseSeed: 42,
      trackCoverage: false,
    });

    const summary = await simulator.run();

    expect(summary.games.length).toBe(3);
    expect(summary.successCount).toBe(3);
    expect(summary.errorCount).toBe(0);
    expect(summary.seeds.length).toBe(3);

    // All seeds should be unique
    const uniqueSeeds = new Set(summary.seeds);
    expect(uniqueSeeds.size).toBe(3);
  }, 90000);

  // Verifies explicit seeds are used correctly
  it("uses explicit seeds when provided", async () => {
    const explicitSeeds = [111, 222, 333];
    const simulator = new Simulator({
      numGames: 3,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      seeds: explicitSeeds,
      trackCoverage: false,
    });

    const summary = await simulator.run();

    expect(summary.seeds).toEqual(explicitSeeds);
    expect(summary.games[0].seed).toBe(111);
    expect(summary.games[1].seed).toBe(222);
    expect(summary.games[2].seed).toBe(333);
  }, 90000);

  // Verifies baseSeed produces reproducible results
  it("produces reproducible results with same baseSeed", async () => {
    const config: SimulatorConfig = {
      numGames: 2,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      baseSeed: 9999,
      trackCoverage: false,
    };

    const sim1 = new Simulator(config);
    const sim2 = new Simulator(config);

    const summary1 = await sim1.run();
    const summary2 = await sim2.run();

    // Seeds should be the same
    expect(summary1.seeds).toEqual(summary2.seeds);

    // Results should be identical
    expect(summary1.games[0].result.winnerId).toBe(
      summary2.games[0].result.winnerId
    );
    expect(summary1.games[0].result.scores).toEqual(
      summary2.games[0].result.scores
    );
  }, 120000);

  // Verifies coverage tracking works
  it("tracks handler coverage when enabled", async () => {
    const simulator = new Simulator({
      numGames: 1,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      baseSeed: 12345,
      trackCoverage: true,
    });

    const summary = await simulator.run();

    expect(summary.coverage).toBeDefined();
    expect(summary.coverage!.total).toBeGreaterThan(0);
    expect(summary.coverage!.covered).toBeGreaterThan(0);
    expect(summary.coverage!.percentage).toBeGreaterThan(0);

    // All 4 turn action handlers should be covered in a full game
    const uncoveredTurnActions = summary.coverage!.uncoveredHandlers.filter(
      (h) => h.endsWith("Handler")
    );
    expect(uncoveredTurnActions).toHaveLength(0);
  }, 30000);

  // Verifies coverage tracker is available when enabled
  it("provides access to coverage tracker", () => {
    const withCoverage = new Simulator({
      numGames: 1,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      trackCoverage: true,
    });
    expect(withCoverage.getCoverageTracker()).not.toBeNull();

    const withoutCoverage = new Simulator({
      numGames: 1,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      trackCoverage: false,
    });
    expect(withoutCoverage.getCoverageTracker()).toBeNull();
  });

  // Verifies simulator works with 3 players
  it("runs games with 3 players", async () => {
    const simulator = new Simulator({
      numGames: 1,
      numPlayers: 3,
      agentTypes: [
        "SmartRandomAgent",
        "SmartRandomAgent",
        "SmartRandomAgent",
      ],
      baseSeed: 77777,
      trackCoverage: false,
    });

    const summary = await simulator.run();

    expect(summary.games.length).toBe(1);
    expect(summary.successCount).toBe(1);
    expect(Object.keys(summary.games[0].result.scores).length).toBe(3);
  }, 45000);

  // Verifies simulator works with 4 players
  it("runs games with 4 players", async () => {
    const simulator = new Simulator({
      numGames: 1,
      numPlayers: 4,
      agentTypes: Array(4).fill("SmartRandomAgent"),
      baseSeed: 88888,
      trackCoverage: false,
    });

    const summary = await simulator.run();

    expect(summary.games.length).toBe(1);
    expect(summary.successCount).toBe(1);
    expect(Object.keys(summary.games[0].result.scores).length).toBe(4);
  }, 60000);

  // Verifies simulator works with 5 players
  it("runs games with 5 players", async () => {
    const simulator = new Simulator({
      numGames: 1,
      numPlayers: 5,
      agentTypes: Array(5).fill("SmartRandomAgent"),
      baseSeed: 99999,
      trackCoverage: false,
    });

    const summary = await simulator.run();

    expect(summary.games.length).toBe(1);
    expect(summary.successCount).toBe(1);
    expect(Object.keys(summary.games[0].result.scores).length).toBe(5);
  }, 75000);

  // Verifies coverage accumulates across multiple games
  it("accumulates coverage across multiple games", async () => {
    const simulator = new Simulator({
      numGames: 3,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      baseSeed: 12345,
      trackCoverage: true,
    });

    const summary = await simulator.run();

    // Coverage should be higher with more games
    expect(summary.coverage!.covered).toBeGreaterThan(4); // More than just turn actions
    expect(summary.coverage!.percentage).toBeGreaterThan(10); // At least some coverage
  }, 90000);

  // Verifies seeds are output for replay capability
  it("outputs seeds for replay capability", async () => {
    const simulator = new Simulator({
      numGames: 3,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      baseSeed: 54321,
      trackCoverage: false,
    });

    const summary = await simulator.run();

    // All seeds should be present
    expect(summary.seeds.length).toBe(3);

    // Can replay a specific game with explicit seed
    const replaySimulator = new Simulator({
      numGames: 1,
      numPlayers: 2,
      agentTypes: ["SmartRandomAgent", "SmartRandomAgent"],
      seeds: [summary.seeds[1]], // Replay second game
      trackCoverage: false,
    });

    const replaySummary = await replaySimulator.run();

    // Replayed game should have same result as original
    expect(replaySummary.games[0].result.winnerId).toBe(
      summary.games[1].result.winnerId
    );
    expect(replaySummary.games[0].result.scores).toEqual(
      summary.games[1].result.scores
    );
  }, 120000);
});
