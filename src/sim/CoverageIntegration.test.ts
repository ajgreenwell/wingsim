/**
 * Integration tests for the ActionProcessor/GameEngine coverage callback.
 *
 * These tests verify that the onHandlerInvoked callback is correctly invoked
 * when handlers are executed during gameplay, enabling the HandlerCoverageTracker
 * to track coverage across simulations.
 */

import { describe, it, expect } from "vitest";
import { GameEngine } from "../engine/GameEngine.js";
import { DataRegistry } from "../data/DataRegistry.js";
import { SmartRandomAgent } from "../agents/SmartRandomAgent.js";
import { HandlerCoverageTracker, type HandlerType } from "./HandlerCoverageTracker.js";
import { TURN_ACTION_HANDLER_IDS, POWER_HANDLER_IDS } from "../engine/__integration__/coverage.js";

describe("Coverage Callback Integration", () => {
  // Verifies that turn action handlers invoke the callback
  it("invokes callback for turn action handlers during gameplay", async () => {
    const registry = new DataRegistry();
    const seed = 12345;
    const invokedHandlers: { handlerId: string; type: HandlerType }[] = [];

    const onHandlerInvoked = (handlerId: string, type: HandlerType) => {
      invokedHandlers.push({ handlerId, type });
    };

    const agent1 = new SmartRandomAgent("player1", seed);
    const agent2 = new SmartRandomAgent("player2", seed ^ 0x9e3779b9);

    const engine = new GameEngine({
      agents: [agent1, agent2],
      seed,
      registry,
      onHandlerInvoked,
    });

    await engine.playGame();

    // Verify some turn action handlers were invoked
    const turnActionInvocations = invokedHandlers.filter(
      (inv) => inv.type === "turnAction"
    );
    expect(turnActionInvocations.length).toBeGreaterThan(0);

    // All 4 turn action handlers should be covered in a full game
    const uniqueTurnActionHandlers = new Set(
      turnActionInvocations.map((inv) => inv.handlerId)
    );
    expect(uniqueTurnActionHandlers.size).toBe(4);
    for (const handlerId of TURN_ACTION_HANDLER_IDS) {
      expect(uniqueTurnActionHandlers.has(handlerId)).toBe(true);
    }
  }, 30000);

  // Verifies that power handlers invoke the callback
  it("invokes callback for power handlers during gameplay", async () => {
    const registry = new DataRegistry();
    const seed = 12345;
    const invokedHandlers: { handlerId: string; type: HandlerType }[] = [];

    const onHandlerInvoked = (handlerId: string, type: HandlerType) => {
      invokedHandlers.push({ handlerId, type });
    };

    const agent1 = new SmartRandomAgent("player1", seed);
    const agent2 = new SmartRandomAgent("player2", seed ^ 0x9e3779b9);

    const engine = new GameEngine({
      agents: [agent1, agent2],
      seed,
      registry,
      onHandlerInvoked,
    });

    await engine.playGame();

    // Verify some power handlers were invoked
    const powerInvocations = invokedHandlers.filter(
      (inv) => inv.type === "power"
    );
    expect(powerInvocations.length).toBeGreaterThan(0);

    // Verify all invoked power handlers are known handlers
    const knownPowerHandlers = new Set<string>(POWER_HANDLER_IDS);
    for (const inv of powerInvocations) {
      expect(knownPowerHandlers.has(inv.handlerId)).toBe(true);
    }
  }, 30000);

  // Verifies HandlerCoverageTracker integrates correctly with GameEngine
  it("HandlerCoverageTracker records invocations from GameEngine", async () => {
    const registry = new DataRegistry();
    const seed = 42;
    const tracker = new HandlerCoverageTracker();

    const agent1 = new SmartRandomAgent("player1", seed);
    const agent2 = new SmartRandomAgent("player2", seed ^ 0x9e3779b9);

    const engine = new GameEngine({
      agents: [agent1, agent2],
      seed,
      registry,
      onHandlerInvoked: (handlerId, type) =>
        tracker.recordInvocation(handlerId, type),
    });

    await engine.playGame();

    // All 4 turn action handlers should be covered
    const coverage = tracker.getCoverage();
    const turnActionCoverage = coverage.filter(
      (inv) => inv.type === "turnAction" && inv.count > 0
    );
    expect(turnActionCoverage.length).toBe(4);

    // Some power handlers should be covered
    const powerCoverage = coverage.filter(
      (inv) => inv.type === "power" && inv.count > 0
    );
    expect(powerCoverage.length).toBeGreaterThan(0);

    // Coverage percentage should be non-zero
    expect(tracker.getCoveragePercentage()).toBeGreaterThan(0);
  }, 30000);

  // Verifies callback not called when not provided (backwards compatibility)
  it("works without callback (backwards compatibility)", async () => {
    const registry = new DataRegistry();
    const seed = 12345;

    const agent1 = new SmartRandomAgent("player1", seed);
    const agent2 = new SmartRandomAgent("player2", seed ^ 0x9e3779b9);

    // No onHandlerInvoked callback - should still work
    const engine = new GameEngine({
      agents: [agent1, agent2],
      seed,
      registry,
    });

    const result = await engine.playGame();

    expect(result).toBeDefined();
    expect(result.winnerId).toBeDefined();
  }, 30000);

  // Verifies GameEngine.fromState also supports the callback
  it("GameEngine.fromState supports onHandlerInvoked callback", async () => {
    const registry = new DataRegistry();
    const seed = 12345;
    const invokedHandlers: { handlerId: string; type: HandlerType }[] = [];

    const onHandlerInvoked = (handlerId: string, type: HandlerType) => {
      invokedHandlers.push({ handlerId, type });
    };

    // First create a regular engine to get initial state
    const agent1 = new SmartRandomAgent("player1", seed);
    const agent2 = new SmartRandomAgent("player2", seed ^ 0x9e3779b9);

    const setupEngine = new GameEngine({
      agents: [agent1, agent2],
      seed,
      registry,
    });

    const gameState = setupEngine.getGameState();

    // Create engine from state with callback
    const engine = GameEngine.fromState({
      agents: [agent1, agent2],
      seed,
      registry,
      gameState,
      onHandlerInvoked,
    });

    // Run a single turn
    await engine.runSingleTurn();

    // Should have invoked at least one turn action handler
    const turnActionInvocations = invokedHandlers.filter(
      (inv) => inv.type === "turnAction"
    );
    expect(turnActionInvocations.length).toBeGreaterThan(0);
  }, 10000);

  // Verifies multiple games accumulate coverage in the tracker
  it("accumulates coverage across multiple games", async () => {
    const registry = new DataRegistry();
    const tracker = new HandlerCoverageTracker();

    // Run 3 games with the same tracker
    for (let i = 0; i < 3; i++) {
      const seed = 1000 + i * 100;
      const agent1 = new SmartRandomAgent("player1", seed);
      const agent2 = new SmartRandomAgent("player2", seed ^ 0x9e3779b9);

      const engine = new GameEngine({
        agents: [agent1, agent2],
        seed,
        registry,
        onHandlerInvoked: (handlerId, type) =>
          tracker.recordInvocation(handlerId, type),
      });

      await engine.playGame();
    }

    // Coverage should be higher than a single game
    const coverage = tracker.getCoverage();
    const coveredHandlers = coverage.filter((inv) => inv.count > 0);

    // With 3 games, we expect decent coverage (at least all 4 turn actions + some powers)
    expect(coveredHandlers.length).toBeGreaterThanOrEqual(4);

    // Turn action handlers should have been invoked many times
    const gainFoodHandler = coverage.find(
      (inv) => inv.handlerId === "gainFoodHandler"
    );
    expect(gainFoodHandler?.count).toBeGreaterThan(1);
  }, 90000);
});
