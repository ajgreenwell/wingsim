/**
 * Integration test for SmartRandomAgent running a full game.
 *
 * This test verifies that SmartRandomAgent can successfully complete
 * an entire game without errors, validating all prompt handlers work
 * correctly in a real game context.
 */

import { describe, it, expect } from "vitest";
import { GameEngine, type GameResult } from "../engine/GameEngine.js";
import { DataRegistry } from "../data/DataRegistry.js";
import { SmartRandomAgent } from "./SmartRandomAgent.js";

describe("SmartRandomAgent Integration", () => {
  // Verifies SmartRandomAgent can complete a full 2-player game without errors
  it("completes a full 2-player game without errors", async () => {
    const registry = new DataRegistry();
    const seed = 12345;

    // Create SmartRandomAgents for both players
    const agent1 = new SmartRandomAgent("player1", seed);
    const agent2 = new SmartRandomAgent("player2", seed ^ 0x9e3779b9);

    const engine = new GameEngine({
      agents: [agent1, agent2],
      seed,
      registry,
    });

    // Run the full game
    const result = await engine.playGame();

    // Verify game completed successfully
    expect(result).toBeDefined();
    expect(result.winnerId).toBeDefined();
    expect(Object.keys(result.scores).length).toBe(2);
    expect(result.roundsPlayed).toBe(4);
  }, 30000); // 30 second timeout for full game

  // Verifies determinism - same seed produces same results
  it("produces deterministic results with same seed", async () => {
    const registry = new DataRegistry();
    const seed = 42;

    // Run game twice with same seed
    const results: GameResult[] = [];

    for (let run = 0; run < 2; run++) {
      const agent1 = new SmartRandomAgent("player1", seed);
      const agent2 = new SmartRandomAgent("player2", seed ^ 0x9e3779b9);

      const engine = new GameEngine({
        agents: [agent1, agent2],
        seed,
        registry,
      });

      const result = await engine.playGame();
      results.push(result);
    }

    // Both runs should produce identical results
    expect(results[0].winnerId).toBe(results[1].winnerId);
    expect(results[0].scores).toEqual(results[1].scores);
    expect(results[0].roundsPlayed).toBe(results[1].roundsPlayed);
    expect(results[0].totalTurns).toBe(results[1].totalTurns);
  }, 60000); // 60 second timeout for two full games

  // Verifies SmartRandomAgent works with 3 players
  it("completes a 3-player game", async () => {
    const registry = new DataRegistry();
    const seed = 99999;

    const agents = [
      new SmartRandomAgent("player1", seed),
      new SmartRandomAgent("player2", seed ^ 0x9e3779b9),
      new SmartRandomAgent("player3", seed ^ (0x9e3779b9 * 2)),
    ];

    const engine = new GameEngine({
      agents,
      seed,
      registry,
    });

    const result = await engine.playGame();

    expect(Object.keys(result.scores).length).toBe(3);
  }, 45000); // 45 second timeout for 3-player game

  // Verifies multiple games with different seeds all complete
  it("completes multiple games with different seeds", async () => {
    const registry = new DataRegistry();
    const baseSeed = 1000;

    for (let i = 0; i < 3; i++) {
      const seed = baseSeed + i * 111;
      const agent1 = new SmartRandomAgent("player1", seed);
      const agent2 = new SmartRandomAgent("player2", seed ^ 0x9e3779b9);

      const engine = new GameEngine({
        agents: [agent1, agent2],
        seed,
        registry,
      });

      const result = await engine.playGame();
      expect(Object.keys(result.scores).length).toBe(2);
    }
  }, 90000); // 90 seconds for 3 games
});
